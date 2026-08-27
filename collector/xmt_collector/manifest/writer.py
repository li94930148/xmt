from __future__ import annotations

import hashlib
import json
import re
import zipfile
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
        with zipfile.ZipFile(target) as workbook:
            if "xl/workbook.xml" not in workbook.namelist():
                raise ValueError("EXPORT_XLSX_INVALID: missing xl/workbook.xml")
            sheet_names = re.findall(r'<sheet[^>]+name="([^"]+)"', workbook.read("xl/workbook.xml").decode("utf-8"))
        if not sheet_names:
            raise ValueError("EXPORT_XLSX_INVALID: workbook contains no sheets")
        return {**sanitize(metadata), "storedFilename": target.name, "size": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "workbookValid": True, "sheetNames": sheet_names}
