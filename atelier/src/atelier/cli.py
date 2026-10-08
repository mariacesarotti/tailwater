"""A CLI: só traduz comandos em chamadas de função. Nenhuma lógica de build mora aqui."""

import importlib.metadata
import logging
from pathlib import Path
from typing import Annotated

import typer

from atelier.build import StageSelectionError, default_stages, run_build
from atelier.config import ConfigError, load_config
from atelier.stage import BuildContext

app = typer.Typer(
    help="atelier: gera os assets do Tailwater (áudio, look) e o manifest.",
    no_args_is_help=True,
    add_completion=False,
)


@app.callback()
def main(
    verbose: Annotated[
        bool,
        typer.Option(
            "--verbose", "-v", help="Mostra também as mensagens de depuração."
        ),
    ] = False,
) -> None:
    """Opções que valem para qualquer comando."""
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO, format="%(message)s"
    )


@app.command()
def build(
    only: Annotated[
        list[str] | None,
        typer.Option(
            "--only", help="Roda só este estágio (repetível). Sem isso, roda todos."
        ),
    ] = None,
    config: Annotated[
        Path, typer.Option("--config", help="Caminho do atelier.toml.")
    ] = Path("atelier.toml"),
) -> None:
    """Gera os assets e escreve o manifest.json."""
    try:
        cfg = load_config(config)
    except ConfigError as exc:
        typer.echo(f"erro: {exc}", err=True)
        raise typer.Exit(1) from exc

    try:
        result = run_build(
            BuildContext(config=cfg),
            default_stages(),
            only,
            importlib.metadata.version("atelier"),
        )
    except StageSelectionError as exc:
        typer.echo(f"erro: {exc}", err=True)
        raise typer.Exit(2) from exc

    if result.manifest is None:
        for name, message in result.failures.items():
            typer.echo(f"estágio {name} falhou:\n{message}", err=True)
        raise typer.Exit(1)

    count = len(result.manifest.assets)
    typer.echo(f"pronto: {count} asset(s) em {cfg.paths.output / 'manifest.json'}")
