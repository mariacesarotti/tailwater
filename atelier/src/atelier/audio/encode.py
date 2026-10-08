"""Casca do ffmpeg: converte a fonte para o formato do pipeline e codifica a saída para a web.

Todo I/O de áudio comprimido passa por aqui. As contas de áudio ficam em outros arquivos.
"""

import subprocess
from pathlib import Path

FORMATS: dict[str, tuple[str, ...]] = {
    "ogg": ("-c:a", "libvorbis", "-q:a", "4"),
    "m4a": ("-c:a", "aac", "-b:a", "128k"),
}

_REPRODUCIBLE = ("-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact")


class EncodeError(Exception):
    """O ffmpeg não existe, ou falhou. A mensagem inclui o stderr dele."""


def _run_ffmpeg(args: list[str], what: str) -> None:
    command = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *args]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError as exc:
        raise EncodeError("ffmpeg não encontrado no PATH") from exc
    if result.returncode != 0:
        raise EncodeError(f"ffmpeg falhou ({what}):\n{result.stderr.strip()}")


def ffmpeg_version() -> str:
    """Primeira linha de `ffmpeg -version` (entra na chave de cache)."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"], capture_output=True, text=True, check=True
        )
    except FileNotFoundError as exc:
        raise EncodeError("ffmpeg não encontrado no PATH") from exc
    return result.stdout.splitlines()[0]


def conform(src: Path, dst: Path, sample_rate: int, channels: int) -> None:
    """Converte a fonte para WAV na taxa e no número de canais do pipeline.

    Usado só quando a fonte não está no formato certo (por exemplo 96 kHz, 6 canais).
    O downmix para menos canais usa a matriz padrão do ffmpeg para o layout do arquivo.
    """
    _run_ffmpeg(
        [
            "-i",
            str(src),
            "-vn",
            "-ar",
            str(sample_rate),
            "-ac",
            str(channels),
            str(dst),
        ],
        f"converter {src.name}",
    )


def encode(wav: Path, dest: Path, fmt: str) -> None:
    """Codifica o WAV em `dest`. O formato do arquivo vem da extensão de `dest`."""
    if fmt not in FORMATS:
        raise EncodeError(
            f"formato desconhecido: {fmt!r} (disponíveis: {sorted(FORMATS)})"
        )
    _run_ffmpeg(
        ["-i", str(wav), "-vn", *FORMATS[fmt], *_REPRODUCIBLE, str(dest)],
        f"codificar {wav.name} para {fmt}",
    )
