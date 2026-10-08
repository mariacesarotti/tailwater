"""Estágio de áudio: a casca. Faz o I/O e chama o núcleo puro (trim, loop, loudness).

Para cada asset da config: lê o WAV, processa, codifica nos formatos da web,
nomeia os arquivos pelo hash do conteúdo e devolve as entradas do manifest.
Quem escreve o manifest.json é o runner, nunca este arquivo.
"""

import json
import logging
import os
import tempfile
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

from atelier.audio.encode import FORMATS, EncodeError, conform, encode, ffmpeg_version
from atelier.audio.loop import make_loop
from atelier.audio.loudness import normalize_loudness
from atelier.audio.trim import trim_silence
from atelier.config import AssetConfig, AssetKind, AudioConfig
from atelier.hashing import hash_file, hash_json
from atelier.manifest import AssetEntry
from atelier.stage import BuildContext, StageResult

logger = logging.getLogger(__name__)

PIPELINE_VERSION = 1

HASH_LENGTH = 10
MAX_CHANNELS = 2
OUTPUT_SUBDIR = "audio"
CACHE_FILE = ".cache.json"


class AudioStageError(Exception):
    """Um ou mais assets de áudio falharam. A mensagem lista todos."""


class AudioStage:
    name = "audio"

    def build(self, ctx: BuildContext) -> StageResult:
        config = ctx.config
        out_dir = config.paths.output / OUTPUT_SUBDIR
        out_dir.mkdir(parents=True, exist_ok=True)
        cache = _load_cache(out_dir)
        version = ffmpeg_version()

        entries: list[AssetEntry] = []
        failures: list[str] = []
        for asset in config.audio.assets:
            try:
                entry = self._build_asset(
                    asset, config.paths.sources, out_dir, config.audio, cache, version
                )
            except (OSError, ValueError, EncodeError, sf.LibsndfileError) as exc:
                failures.append(f"  - {asset.id}: {exc}")
                continue
            entries.append(entry)

        _save_cache(out_dir, cache)
        if failures:
            raise AudioStageError(
                f"{len(failures)} asset(s) de áudio falharam:\n" + "\n".join(failures)
            )
        return StageResult(assets=entries)

    def _build_asset(
        self,
        asset: AssetConfig,
        sources: Path,
        out_dir: Path,
        audio: AudioConfig,
        cache: dict[str, dict[str, object]],
        ffmpeg: str,
    ) -> AssetEntry:
        src = sources / asset.source
        if not src.is_file():
            raise FileNotFoundError(f"fonte não encontrada: {src}")

        key = _cache_key(asset, src, audio, ffmpeg)
        cached = cache.get(asset.id)
        if cached is not None and cached.get("key") == key:
            entry = AssetEntry.model_validate(cached["entry"])
            if all((out_dir.parent / rel).is_file() for rel in entry.files.values()):
                logger.info("%s: pulado (cache)", asset.id)
                return entry

        entry = _process(asset, src, out_dir, audio)
        cache[asset.id] = {"key": key, "entry": entry.model_dump(mode="json")}
        return entry


def _cache_key(asset: AssetConfig, src: Path, audio: AudioConfig, ffmpeg: str) -> str:
    """Tudo que influencia o resultado: se algo daqui muda, o asset é refeito."""
    role = audio.sfx if asset.kind is AssetKind.SFX else audio.ambience
    return hash_json(
        {
            "pipeline": PIPELINE_VERSION,
            "source": hash_file(src),
            "asset": asset.model_dump(mode="json"),
            "role": role.model_dump(mode="json"),
            "sample_rate": audio.sample_rate,
            "peak_ceiling_db": audio.peak_ceiling_db,
            "trim": audio.trim.model_dump(mode="json"),
            "formats": {name: list(args) for name, args in FORMATS.items()},
            "ffmpeg": ffmpeg,
        }
    )


def _load_cache(out_dir: Path) -> dict[str, dict[str, object]]:
    path = out_dir / CACHE_FILE
    try:
        data = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _save_cache(out_dir: Path, cache: dict[str, dict[str, object]]) -> None:
    _atomic_write_text(
        out_dir / CACHE_FILE, json.dumps(cache, indent=2, sort_keys=True)
    )


def _atomic_write_text(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def _process(
    asset: AssetConfig, src: Path, out_dir: Path, audio: AudioConfig
) -> AssetEntry:
    is_ambience = asset.kind is AssetKind.AMBIENCE
    role = audio.ambience if is_ambience else audio.sfx
    rate = audio.sample_rate

    with tempfile.TemporaryDirectory(dir=out_dir, prefix=f".{asset.id}-") as tmp_name:
        tmp = Path(tmp_name)
        samples = _read_conformed(asset.id, src, tmp, rate)

        if role.apply_trim:
            samples = trim_silence(
                samples, rate, audio.trim.threshold_db, audio.trim.margin_ms
            )
        if is_ambience:
            samples = make_loop(samples, rate, audio.ambience.crossfade_ms)
        try:
            samples = normalize_loudness(
                samples, rate, role.target_lufs, audio.peak_ceiling_db
            )
        except ValueError as exc:
            raise ValueError(f"não foi possível medir o loudness: {exc}") from exc

        wav = tmp / "master.wav"
        sf.write(wav, samples, rate, subtype="FLOAT")

        files: dict[str, str] = {}
        for fmt in FORMATS:
            encoded = tmp / f"master.{fmt}"
            encode(wav, encoded, fmt)
            final = out_dir / f"{asset.id}.{hash_file(encoded)[:HASH_LENGTH]}.{fmt}"
            os.replace(encoded, final)
            files[fmt] = final.relative_to(out_dir.parent).as_posix()

    entry = AssetEntry(
        id=asset.id,
        kind="audio",
        stage="audio",
        files=files,
        meta=_measure(samples, rate, asset.kind, loop=is_ambience),
    )
    logger.info("%s: gerado (%s)", asset.id, ", ".join(files.values()))
    return entry


def _read_conformed(asset_id: str, src: Path, tmp: Path, rate: int) -> np.ndarray:
    """Lê a fonte; se a taxa ou o número de canais não servem, converte com o ffmpeg antes."""
    info = sf.info(src)
    if info.samplerate != rate or info.channels > MAX_CHANNELS:
        channels = min(info.channels, MAX_CHANNELS)
        logger.warning(
            "%s: convertendo fonte (%d Hz, %d canais) para (%d Hz, %d canais)",
            asset_id,
            info.samplerate,
            info.channels,
            rate,
            channels,
        )
        converted = tmp / "conformed.wav"
        conform(src, converted, rate, channels)
        src = converted
    data, _ = sf.read(src, dtype="float32")
    return np.asarray(data)


def _measure(
    samples: np.ndarray, rate: int, kind: AssetKind, loop: bool
) -> dict[str, float | str | bool | None]:
    """Medidas do áudio FINAL, para o manifest. Valores não finitos viram None (JSON válido)."""
    peak = float(np.max(np.abs(samples), initial=0.0))
    loudness = float(pyln.Meter(rate).integrated_loudness(samples))
    return {
        "role": kind.value,
        "duration_s": round(samples.shape[0] / rate, 3),
        "loudness_lufs": round(loudness, 2) if np.isfinite(loudness) else None,
        "peak_db": round(20 * np.log10(peak), 2) if peak > 0 else None,
        "loop": loop,
    }
