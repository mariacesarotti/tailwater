import typer

app = typer.Typer()


@app.callback()
def main() -> None:
    """Pipeline de pós-produção do Tailwater."""


@app.command()
def build(only: str | None = None) -> None:
    """Gera os assets consumidos pela web."""
    print(f"build {only}")
