from typer.testing import CliRunner

from atelier.cli import app

runner = CliRunner()


def test_build_runs() -> None:
    result = runner.invoke(app, ["build", "--only", "audio"])
    assert result.exit_code == 0
