from pathlib import Path

import pytest

from atelier.config import ConfigError, load_config

REAL_TOML = Path(__file__).parent.parent / "atelier.toml"


def test_real_config_loads() -> None:
    config = load_config(REAL_TOML)

    assert config.audio.sample_rate in (44100, 48000)
    assert len(config.audio.assets) > 0
    assert config.audio.sfx.target_lufs < 0


def _write_variant(tmp_path: Path, old: str, new: str) -> Path:
    text = REAL_TOML.read_text()
    assert old in text, f"trecho {old!r} não existe no atelier.toml"
    broken = tmp_path / "broken.toml"
    broken.write_text(text.replace(old, new, 1))
    return broken


def test_unknown_key_is_rejected(tmp_path: Path) -> None:
    broken = _write_variant(tmp_path, "[audio.sfx]\n", "[audio.sfx]\nnao_existe = 1\n")

    with pytest.raises(ConfigError, match="Extra inputs are not permitted"):
        load_config(broken)
