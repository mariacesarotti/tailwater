"""O manifest: o contrato entre o atelier (Python) e a web (JavaScript).

A web só confia no que está aqui. Qualquer mudança neste arquivo é mudança de interface:
se o formato mudar de forma incompatível, suba MANIFEST_SCHEMA_VERSION.

Decisão: não há `generated_at`. Um timestamp faria dois builds idênticos gerarem manifests
diferentes, e o projeto promete builds reproduzíveis. Rastreabilidade fica com o
`atelier_version` (e com o Git).
"""

import json
import math
import os
from collections import Counter
from collections.abc import Iterable
from pathlib import Path, PurePosixPath
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MANIFEST_SCHEMA_VERSION = 1

# Valores permitidos em `meta`. None existe para medidas que não se aplicam
# (ex.: loudness de um som mudo). NaN/Infinity são recusados: não são JSON válido.
MetaValue = float | str | bool | None


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AssetEntry(_Model):
    """Um asset gerado por algum estágio."""

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    kind: Literal["audio", "lut", "mesh", "path"]
    stage: str = Field(
        min_length=1
    )  # qual estágio gerou (usado para mesclar com --only)
    files: dict[str, str] = Field(
        min_length=1
    )  # formato → caminho relativo ao manifest
    meta: dict[str, MetaValue] = Field(default_factory=dict)

    @field_validator("files")
    @classmethod
    def _paths_must_be_relative_and_inside(
        cls, files: dict[str, str]
    ) -> dict[str, str]:
        for fmt, raw in files.items():
            path = PurePosixPath(raw)
            if path.is_absolute() or ".." in path.parts or "\\" in raw:
                raise ValueError(f"caminho inválido em files[{fmt!r}]: {raw!r}")
        return files

    @field_validator("meta")
    @classmethod
    def _numbers_must_be_finite(
        cls, meta: dict[str, MetaValue]
    ) -> dict[str, MetaValue]:
        for key, value in meta.items():
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError(f"meta[{key!r}] não é finito ({value}); use None")
        return meta


class Manifest(_Model):
    schema_version: int = MANIFEST_SCHEMA_VERSION
    atelier_version: str
    assets: tuple[AssetEntry, ...]

    @model_validator(mode="after")
    def _ids_must_be_unique(self) -> Self:
        counts = Counter(asset.id for asset in self.assets)
        repeated = sorted(id_ for id_, n in counts.items() if n > 1)
        if repeated:
            raise ValueError(f"ids de asset repetidos entre estágios: {repeated}")
        return self


def build_manifest(assets: Iterable[AssetEntry], atelier_version: str) -> Manifest:
    """Junta os assets de todos os estágios. A ordem é por id: estável, não importa
    qual estágio rodou primeiro."""
    return Manifest(
        atelier_version=atelier_version,
        assets=tuple(sorted(assets, key=lambda asset: asset.id)),
    )


def manifest_json(manifest: Manifest) -> str:
    """O texto do manifest.json: chaves ordenadas, indentado, JSON estritamente válido."""
    data = manifest.model_dump(mode="json")
    return (
        json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False)
        + "\n"
    )


def write_manifest(manifest: Manifest, path: Path) -> None:
    """Escreve de forma atômica: o navegador nunca vê um manifest pela metade.

    Chame por ÚLTIMO, depois que todos os arquivos citados já existem.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(manifest_json(manifest), encoding="utf-8")
    os.replace(tmp, path)