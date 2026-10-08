import hashlib
from pathlib import Path

import pytest

from atelier.hashing import canonical_json, hash_bytes, hash_file, hash_json


def test_hash_file_matches_hashlib_across_chunk_boundary(tmp_path: Path) -> None:
    data = bytes(range(256)) * 10_000 + b"fim"  # ~2,5 MB: passa de um pedaço de 1 MiB
    path = tmp_path / "big.bin"
    path.write_bytes(data)
    assert hash_file(path) == hashlib.sha256(data).hexdigest()


def test_hash_file_empty_file(tmp_path: Path) -> None:
    path = tmp_path / "empty"
    path.write_bytes(b"")
    assert hash_file(path) == hash_bytes(b"")


def test_different_content_different_hash(tmp_path: Path) -> None:
    a, b = tmp_path / "a", tmp_path / "b"
    a.write_bytes(b"abc")
    b.write_bytes(b"abd")
    assert hash_file(a) != hash_file(b)


def test_hash_json_ignores_key_order() -> None:
    one = {"a": 1, "b": {"x": [1, 2], "y": "z"}}
    other = {"b": {"y": "z", "x": [1, 2]}, "a": 1}
    assert hash_json(one) == hash_json(other)


def test_hash_json_respects_list_order() -> None:
    assert hash_json({"a": [1, 2]}) != hash_json({"a": [2, 1]})


def test_hash_json_detects_a_changed_value() -> None:
    assert hash_json({"target": -23.0}) != hash_json({"target": -16.0})


def test_hash_json_is_stable_text() -> None:
    assert canonical_json({"b": 1, "a": "ç"}) == '{"a":"ç","b":1}'


@pytest.mark.parametrize("bad", [float("nan"), float("inf")])
def test_hash_json_rejects_non_finite_numbers(bad: float) -> None:
    with pytest.raises(ValueError):
        hash_json({"x": bad})


def test_hash_json_rejects_unknown_types_instead_of_guessing() -> None:
    with pytest.raises(TypeError):
        hash_json({"path": Path("a/b")})
