"""Settings from environment variables and an optional .env file. Secrets stay server-side."""

from __future__ import annotations

import os
from pathlib import Path

SECRET_KEYS = {"SPAPI_LWA_CLIENT_SECRET", "SPAPI_REFRESH_TOKEN", "KEEPA_API_KEY", "ARP_SECRET_KEY"}


def load_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


class Settings:
    def __init__(self, env: dict[str, str] | None = None, dotenv: Path | None = None) -> None:
        merged = dict(load_dotenv(dotenv or Path(".env")))
        merged.update(os.environ if env is None else env)
        self._env = merged
        self.data_dir = Path(merged.get("ARP_DATA_DIR", "./data"))

    def get(self, key: str, default: str = "") -> str:
        return self._env.get(key, default)

    def has(self, *keys: str) -> bool:
        return all(self._env.get(k) for k in keys)

    def redacted(self) -> dict[str, str]:
        """Safe to log or show: secrets are replaced, never echoed."""
        keys = ("ARP_DATA_DIR", *sorted(SECRET_KEYS), "SPAPI_LWA_CLIENT_ID")
        return {k: ("set (hidden)" if k in SECRET_KEYS and self._env.get(k) else self._env.get(k, "")
                    or "not set") for k in keys}
