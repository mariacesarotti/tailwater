import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from typer.testing import CliRunner

from atelier.cli import app

SR = 48_000
runner = CliRunner()

TOML = """
[paths]
sources = "src"
output = "out"

[audio]
sample_rate = 48000
peak_ceiling_db = -1.0

[audio.trim]
threshold_db = -60.0
margin_ms = 20.0

[audio.sfx]
target_lufs = -23.0
apply_trim = true

[audio.ambience]
target_lufs = -30.0
apply_trim = false
crossfade_ms = 500.0

[[audio.assets]]
id = "ambience-earlymorning"
source = "ambience/earlymorning/morning.wav"
kind = "ambience"
"""


@pytest.fixture
def project(tmp_path: Path) -> Path:
    folder = tmp_path / "src" / "ambience" / "earlymorning"
    folder.mkdir(parents=True)
    other = tmp_path / "src" / "ambience" / "night"
    other.mkdir(parents=True)
    rng = np.random.default_rng(0)
    sf.write(
        folder / "morning.wav", rng.normal(0, 0.05, (SR * 3, 2)), SR, subtype="FLOAT"
    )
    sf.write(other / "night.wav", rng.normal(0, 0.05, (SR * 3, 2)), SR, subtype="FLOAT")
    (tmp_path / "atelier.toml").write_text(TOML)
    return tmp_path


def invoke(project: Path, *args: str):
    return runner.invoke(
        app, ["build", "--config", str(project / "atelier.toml"), *args]
    )


def test_build_only_audio_writes_only_the_listed_assets(project: Path) -> None:
    result = invoke(project, "--only", "audio")
    assert result.exit_code == 0, result.output
    manifest = json.loads((project / "out" / "manifest.json").read_text())
    assert [a["id"] for a in manifest["assets"]] == ["ambience-earlymorning"]
    assert not list((project / "out" / "audio").glob("ambience-night*"))


def test_unknown_stage_exits_with_2_and_lists_valid_names(project: Path) -> None:
    result = invoke(project, "--only", "nope")
    assert result.exit_code == 2
    assert "disponíveis: audio" in result.output


def test_invalid_config_exits_with_1_before_doing_anything(project: Path) -> None:
    (project / "atelier.toml").write_text(
        TOML.replace("target_lufs = -23.0", "target_lufz = -23.0")
    )
    result = invoke(project)
    assert result.exit_code == 1 and "config inválida" in result.output
    assert not (project / "out").exists()


def test_missing_source_exits_with_1_and_no_manifest(project: Path) -> None:
    (project / "src" / "ambience" / "earlymorning" / "morning.wav").unlink()
    result = invoke(project)
    assert result.exit_code == 1
    assert (
        "estágio audio falhou" in result.output
        and "fonte não encontrada" in result.output
    )
    assert not (project / "out" / "manifest.json").exists()


def test_no_arguments_shows_help() -> None:
    result = runner.invoke(app, [])
    assert "build" in result.output
