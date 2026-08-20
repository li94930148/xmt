from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from xmt_collector.security.sanitizer import sanitize


class ManifestWriter:
    def __init__(self, run_root: Path) -> None:
        self.run_root = run_root
        self.run_root.mkdir(parents=True, exist_ok=True)

    def write_json(self, relative: str, value: dict[str, Any]) -> Path:
        target = self.run_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(sanitize(value), ensure_ascii=False, indent=2), encoding="utf-8")
        return target

    def save_export(self, source: Path, metadata: dict[str, Any]) -> dict[str, Any]:
        target = self.run_root / "exports" / source.name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        return {**sanitize(metadata), "storedFilename": target.name, "size": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}
