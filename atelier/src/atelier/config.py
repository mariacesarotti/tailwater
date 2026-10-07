"""Configuração do atelier: lê o atelier.toml e valida tudo antes de processar qualquer arquivo."""

import tomllib
from collections import Counter
from enum import StrEnum
from pathlib import Path
from typing import Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)


class ConfigError(Exception):
    """Config ausente, com TOML quebrado ou com valores inválidos."""


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AssetKind(StrEnum):
    SFX = "sfx"
    AMBIENCE = "ambience"


class PathsConfig(_Model):
    sources: Path
    output: Path


class TrimConfig(_Model):
    threshold_db: float = Field(lt=0)
    margin_ms: float = Field(ge=0)


class SfxConfig(_Model):
    target_lufs: float = Field(ge=-70, lt=0)
    apply_trim: bool


class AmbienceConfig(_Model):
    target_lufs: float = Field(ge=-70, lt=0)
    apply_trim: bool
    crossfade_ms: float = Field(ge=0)


class AssetConfig(_Model):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")
    source: Path
    kind: AssetKind

    @field_validator("source")
    @classmethod
    def _source_must_be_relative(cls, value: Path) -> Path:
        if value.is_absolute():
            raise ValueError("source deve ser relativo à pasta de fontes")
        return value


class AudioConfig(_Model):
    sample_rate: Literal[44100, 48000]
    peak_ceiling_db: float = Field(le=0)
    trim: TrimConfig
    sfx: SfxConfig
    ambience: AmbienceConfig
    assets: tuple[AssetConfig, ...]

    @model_validator(mode="after")
    def _ids_must_be_unique(self) -> Self:
        counts = Counter(asset.id for asset in self.assets)
        repeated = sorted(id_ for id_, n in counts.items() if n > 1)
        if repeated:
            raise ValueError(f"ids de asset repetidos: {repeated}")
        return self


class Config(_Model):
    paths: PathsConfig
    audio: AudioConfig


def load_config(path: Path) -> Config:
    """Lê e valida o TOML. Caminhos relativos são resolvidos a partir da pasta do arquivo."""
    try:
        with path.open("rb") as file:
            raw = tomllib.load(file)
    except FileNotFoundError as exc:
        raise ConfigError(f"config não encontrada: {path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"TOML inválido em {path}: {exc}") from exc

    try:
        config = Config.model_validate(raw)
    except ValidationError as exc:
        raise ConfigError(f"config inválida em {path}:\n{exc}") from exc

    return _resolve_paths(config, base_dir=path.resolve().parent)


def _resolve_paths(config: Config, base_dir: Path) -> Config:
    paths = PathsConfig(
        sources=(base_dir / config.paths.sources).resolve(),
        output=(base_dir / config.paths.output).resolve(),
    )
    return config.model_copy(update={"paths": paths})