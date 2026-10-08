"""Hashes do atelier. Dois papéis diferentes, que não se misturam:

- hash de CONTEÚDO (hash_file): vira parte do nome do arquivo gerado, para o cache do
  navegador. Muda só quando os bytes mudam.
- chave de CACHE (hash_json): resume tudo que influencia um resultado (fonte, config,
  versões de ferramentas), para decidir se o trabalho precisa ser refeito.
"""

import hashlib
import json
from pathlib import Path

_CHUNK_SIZE = 1 << 20  # 1 MiB: arquivos grandes nunca são lidos inteiros na memória


def hash_bytes(data: bytes) -> str:
    """sha256 em hexadecimal (64 caracteres)."""
    return hashlib.sha256(data).hexdigest()


def hash_file(path: Path) -> str:
    """sha256 do conteúdo do arquivo, lido em pedaços."""
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(_CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(data: object) -> str:
    """JSON de forma única: mesma informação, mesmo texto.

    Chaves ordenadas, sem espaços e sem NaN/Infinity (que não são JSON válido).
    Levanta TypeError para tipos que o JSON não conhece (Path, set...), em vez de
    adivinhar uma conversão: converta antes, de forma explícita.
    """
    return json.dumps(
        data, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


def hash_json(data: object) -> str:
    """sha256 da forma canônica de `data` (a ordem das chaves não importa)."""
    return hash_bytes(canonical_json(data).encode("utf-8"))
