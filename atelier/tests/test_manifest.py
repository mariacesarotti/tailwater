import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from atelier.audio.audio_stage import AudioStage
from atelier.manifest import (
    MANIFEST_SCHEMA_VERSION,
    AssetEntry,
    Manifest,
    build_manifest,
    manifest_json,
    write_manifest,
)
from atelier.stage import Stage


def entry(id_: str = "river", **overrides: object) -> AssetEntry:
    fields: dict[str, object] = {
        "id": id_,
        "kind": "audio",
        "stage": "audio",
        "files": {"ogg": f"audio/{id_}.abc.ogg", "m4a": f"audio/{id_}.abc.m4a"},
        "meta": {
            "duration_s": 3.5,
            "loudness_lufs": -30.0,
            "peak_db": None,
            "loop": True,
        },
    }
    fields.update(overrides)
    return AssetEntry.model_validate(fields)


def test_audio_stage_satisfies_the_stage_protocol() -> None:
    stage: Stage = AudioStage()  # o mypy confere o contrato; aqui só garantimos o nome
    assert stage.name == "audio"


def test_json_is_valid_for_the_browser_and_has_schema_version() -> None:
    text = manifest_json(build_manifest([entry()], "0.1.0"))
    data = json.loads(
        text, parse_constant=lambda c: pytest.fail(f"constante inválida: {c}")
    )
    assert data["schema_version"] == MANIFEST_SCHEMA_VERSION
    assert (
        data["assets"][0]["meta"]["peak_db"] is None
    )  # None vira null, nunca -Infinity
    assert text.endswith("\n")


def test_assets_are_sorted_by_id_regardless_of_input_order() -> None:
    a = manifest_json(build_manifest([entry("b"), entry("a"), entry("c")], "0.1.0"))
    b = manifest_json(build_manifest([entry("c"), entry("b"), entry("a")], "0.1.0"))
    assert a == b
    assert [x["id"] for x in json.loads(a)["assets"]] == ["a", "b", "c"]


def test_same_input_same_bytes() -> None:
    assert manifest_json(build_manifest([entry()], "0.1.0")) == manifest_json(
        build_manifest([entry()], "0.1.0")
    )


def test_duplicate_ids_across_stages_are_rejected() -> None:
    with pytest.raises(ValidationError, match="ids de asset repetidos"):
        build_manifest([entry("x"), entry("x", stage="look", kind="lut")], "0.1.0")


@pytest.mark.parametrize(
    "bad", ["/abs/path.ogg", "../fora.ogg", "audio/../../x.ogg", "a\\b.ogg"]
)
def test_file_paths_must_be_relative_and_inside(bad: str) -> None:
    with pytest.raises(ValidationError, match="caminho inválido"):
        entry(files={"ogg": bad})


def test_files_cannot_be_empty() -> None:
    with pytest.raises(ValidationError):
        entry(files={})


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_meta_is_rejected(bad: float) -> None:
    with pytest.raises(ValidationError, match="não é finito"):
        entry(meta={"loudness_lufs": bad})


def test_unknown_kind_and_unknown_field_are_rejected() -> None:
    with pytest.raises(ValidationError):
        entry(kind="video")
    with pytest.raises(ValidationError):
        entry(surprise=1)


def test_round_trip(tmp_path: Path) -> None:
    manifest = build_manifest([entry("a"), entry("b")], "0.1.0")
    path = tmp_path / "out" / "manifest.json"  # a pasta ainda não existe
    write_manifest(manifest, path)
    assert Manifest.model_validate_json(path.read_text()) == manifest


def test_write_is_atomic_and_overwrites(tmp_path: Path) -> None:
    path = tmp_path / "manifest.json"
    write_manifest(build_manifest([entry("a")], "0.1.0"), path)
    write_manifest(build_manifest([entry("b")], "0.2.0"), path)
    assert json.loads(path.read_text())["atelier_version"] == "0.2.0"
    assert [p.name for p in tmp_path.iterdir()] == [
        "manifest.json"
    ]  # nenhum .tmp sobrando