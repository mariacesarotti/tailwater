import json
from dataclasses import dataclass
from pathlib import Path

import pytest

from atelier.build import (
    MANIFEST_NAME,
    StageSelectionError,
    default_stages,
    run_build,
    select_stages,
)
from atelier.config import Config
from atelier.manifest import AssetEntry
from atelier.stage import BuildContext, Stage, StageResult


def make_ctx(tmp_path: Path) -> BuildContext:
    config = Config.model_validate(
        {
            "paths": {
                "sources": str(tmp_path / "src"),
                "output": str(tmp_path / "out"),
            },
            "audio": {
                "sample_rate": 48000,
                "peak_ceiling_db": -1.0,
                "trim": {"threshold_db": -60.0, "margin_ms": 20.0},
                "sfx": {"target_lufs": -23.0, "apply_trim": True},
                "ambience": {
                    "target_lufs": -30.0,
                    "apply_trim": False,
                    "crossfade_ms": 0.0,
                },
                "assets": [],
            },
        }
    )
    return BuildContext(config=config)


def asset(id_: str, stage: str) -> AssetEntry:
    return AssetEntry(
        id=id_, kind="audio", stage=stage, files={"ogg": f"audio/{id_}.ogg"}, meta={}
    )


@dataclass
class FakeStage:
    name: str
    ids: tuple[str, ...] = ()
    error: Exception | None = None
    calls: int = 0

    def build(self, ctx: BuildContext) -> StageResult:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return StageResult(assets=[asset(i, self.name) for i in self.ids])


def stages(*fakes: FakeStage) -> list[Stage]:
    return list(fakes)


def test_runs_every_stage_and_writes_the_manifest(tmp_path: Path) -> None:
    ctx = make_ctx(tmp_path)
    result = run_build(
        ctx, stages(FakeStage("audio", ("b",)), FakeStage("look", ("a",))), None, "9.9"
    )
    assert result.ok and result.manifest is not None
    written = json.loads((tmp_path / "out" / MANIFEST_NAME).read_text())
    assert [a["id"] for a in written["assets"]] == ["a", "b"]  # ordenado por id
    assert written["atelier_version"] == "9.9"


def test_only_runs_just_the_selected_stage(tmp_path: Path) -> None:
    audio, look = FakeStage("audio", ("a",)), FakeStage("look", ("l",))
    run_build(make_ctx(tmp_path), stages(audio, look), ["audio"], "1")
    assert (audio.calls, look.calls) == (1, 0)


def test_unknown_only_lists_the_valid_names(tmp_path: Path) -> None:
    with pytest.raises(
        StageSelectionError, match=r"desconhecido: nope.*disponíveis: audio, look"
    ):
        run_build(
            make_ctx(tmp_path),
            stages(FakeStage("audio"), FakeStage("look")),
            ["nope"],
            "1",
        )


def test_duplicate_stage_names_are_rejected() -> None:
    with pytest.raises(StageSelectionError, match="dois estágios"):
        select_stages(stages(FakeStage("audio"), FakeStage("audio")), None)


def test_failure_runs_the_rest_reports_all_and_writes_no_manifest(
    tmp_path: Path,
) -> None:
    ok = FakeStage("look", ("l",))
    boom = FakeStage("audio", error=RuntimeError("ffmpeg quebrou"))
    other = FakeStage("terrain", error=ValueError("outra falha"))
    result = run_build(make_ctx(tmp_path), stages(boom, ok, other), None, "1")
    assert not result.ok and result.manifest is None
    assert result.failures == {"audio": "ffmpeg quebrou", "terrain": "outra falha"}
    assert ok.calls == 1  # o estágio saudável rodou mesmo assim
    assert not (tmp_path / "out" / MANIFEST_NAME).exists()


def test_failed_build_keeps_the_previous_manifest(tmp_path: Path) -> None:
    ctx = make_ctx(tmp_path)
    run_build(ctx, stages(FakeStage("audio", ("a",))), None, "1")
    before = (tmp_path / "out" / MANIFEST_NAME).read_text()
    run_build(ctx, stages(FakeStage("audio", error=RuntimeError("x"))), None, "1")
    assert (tmp_path / "out" / MANIFEST_NAME).read_text() == before


def test_duplicate_asset_ids_across_stages_fail_loudly(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="ids de asset repetidos"):
        run_build(
            make_ctx(tmp_path),
            stages(FakeStage("a", ("x",)), FakeStage("b", ("x",))),
            None,
            "1",
        )


def test_default_stages_has_audio() -> None:
    assert [s.name for s in default_stages()] == ["audio"]
