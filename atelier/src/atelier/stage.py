"""O contrato de um estágio do build.

Mora na raiz do pacote, e não dentro de `audio/`, porque todo estágio (áudio, look, e
os que vierem) implementa a mesma interface. Este módulo só define tipos: não faz I/O e
não importa nenhum estágio. Quem importa este módulo são os estágios e o runner.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from atelier.config import Config
from atelier.manifest import AssetEntry


@dataclass(frozen=True)
class BuildContext:
    """Tudo que um estágio recebe do runner. Já validado: config inválida nunca chega aqui."""

    config: Config


@dataclass(frozen=True)
class StageResult:
    """O que um estágio devolve. É um objeto (e não uma lista) para poder ganhar campos
    depois (o look vai contribuir com `time_presets` e `silence`) sem quebrar os
    estágios que já existem. Estágios nunca escrevem o manifest: só o runner."""

    assets: Sequence[AssetEntry] = ()


class Stage(Protocol):
    name: str

    def build(self, ctx: BuildContext) -> StageResult: ...
