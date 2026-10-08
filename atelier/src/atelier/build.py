"""O runner: roda os estágios escolhidos e, se todos deram certo, escreve o manifest.

É o ponto de composição: o único lugar que conhece os estágios concretos
(`default_stages`). Não lê config, não imprime e não chama sys.exit: devolve um
`BuildResult` e quem chama (o cli.py) decide o que mostrar e qual código de saída usar.
"""

import logging
from collections.abc import Collection, Sequence
from dataclasses import dataclass, field

from atelier.audio.audio_stage import AudioStage
from atelier.manifest import AssetEntry, Manifest, build_manifest, write_manifest
from atelier.stage import BuildContext, Stage

logger = logging.getLogger(__name__)

MANIFEST_NAME = "manifest.json"


class StageSelectionError(ValueError):
    """Estágios com nome repetido, ou um --only com nome que não existe."""


@dataclass(frozen=True)
class BuildResult:
    manifest: Manifest | None
    failures: dict[str, str] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.failures


def default_stages() -> list[Stage]:
    """A lista de estágios do projeto. Para um estágio novo (look), é aqui que ele entra."""
    return [AudioStage()]


def select_stages(stages: Sequence[Stage], only: Collection[str] | None) -> list[Stage]:
    """Valida os nomes e devolve os estágios a rodar, na ordem em que foram registrados."""
    by_name: dict[str, Stage] = {}
    for stage in stages:
        if stage.name in by_name:
            raise StageSelectionError(f"dois estágios com o nome {stage.name!r}")
        by_name[stage.name] = stage

    if not only:
        return list(stages)
    unknown = sorted(set(only) - by_name.keys())
    if unknown:
        raise StageSelectionError(
            f"estágio desconhecido: {', '.join(unknown)} (disponíveis: {', '.join(sorted(by_name))})"
        )
    return [stage for stage in stages if stage.name in set(only)]


def run_build(
    ctx: BuildContext,
    stages: Sequence[Stage],
    only: Collection[str] | None,
    atelier_version: str,
) -> BuildResult:
    """Roda os estágios selecionados. Todos rodam, mesmo se um falhar (no CI, ver todas
    as falhas de uma vez poupa rodadas). O manifest só é escrito se NENHUM falhou, e por
    último, depois que todos os arquivos que ele cita já existem."""
    selected = select_stages(stages, only)
    if len(selected) < len(stages):
        logger.warning(
            "rodando só %s: o manifest terá apenas esses estágios",
            [s.name for s in selected],
        )

    assets: list[AssetEntry] = []
    failures: dict[str, str] = {}
    for stage in selected:
        logger.info("estágio %s: começando", stage.name)
        try:
            result = stage.build(ctx)
        except Exception as exc:
            logger.exception("estágio %s falhou", stage.name)
            failures[stage.name] = str(exc) or type(exc).__name__
            continue
        assets.extend(result.assets)

    if failures:
        return BuildResult(manifest=None, failures=failures)

    manifest = build_manifest(assets, atelier_version)
    write_manifest(manifest, ctx.config.paths.output / MANIFEST_NAME)
    return BuildResult(manifest=manifest)
