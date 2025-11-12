from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_PROMPTS_DIR = Path(__file__).resolve().parent


@lru_cache(maxsize=None)
def load_prompt(name: str, *, extension: str = ".txt") -> str:
    """
    Load a system prompt from the prompts directory.

    Prompts are stored as plain text files. By default, the loader looks for
    files with a `.txt` extension. Cached results eliminate repeated disk reads.
    """
    if not name:
        raise ValueError("Prompt name must be a non-empty string.")

    filename = name if name.endswith(extension) else f"{name}{extension}"
    prompt_path = _PROMPTS_DIR / filename

    if not prompt_path.exists():
        raise FileNotFoundError(
            f"System prompt '{name}' not found at {prompt_path}."
        )

    return prompt_path.read_text(encoding="utf-8").strip()


def list_prompts(*, extension: str = ".txt") -> list[str]:
    """Return the available prompt names (without extensions)."""
    names: list[str] = []
    for path in _PROMPTS_DIR.glob(f"*{extension}"):
        if path.is_file():
            names.append(path.stem)
    return sorted(names)


__all__ = ["load_prompt", "list_prompts"]

