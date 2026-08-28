"""Local, dependency-free parser for the small subset of XLSX used by Douyin exports.

It deliberately returns normalized records only: source workbooks never leave the
Creator Agent data directory.
"""
from __future__ import annotations

import hashlib
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
CONTENT_HEADERS = {"作品名称": "title", "发布时间": "published_at", "播放量": "views", "点赞量": "likes", "评论量": "comments", "分享量": "shares", "收藏量": "favorites", "主页访问量": "profile_visits", "粉丝增量": "followers_gained", "完播率": "completion_rate", "5s完播率": "five_second_completion_rate", "封面点击率": "cover_click_rate", "2s跳出率": "two_second_bounce_rate", "平均播放时长": "watch_time_seconds", "体裁": "content_format", "审核状态": "review_status"}
INCOME_HEADERS = {"日期": "metric_date", "收获音浪": "sound_wave_amount"}

def _letters(ref: str) -> int:
    value = 0
    for char in re.match(r"[A-Z]+", ref or "A").group(0): value = value * 26 + ord(char) - 64
    return value - 1

def _text(cell: ET.Element, shared: list[str]) -> str:
    kind = cell.attrib.get("t")
    value = cell.findtext("m:v", default="", namespaces=NS)
    if kind == "s" and value.isdigit(): return shared[int(value)]
    if kind == "inlineStr": return "".join(cell.itertext()).strip()
    return value.strip()

def _rows(file: Path) -> list[list[str]]:
    with zipfile.ZipFile(file) as book:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in book.namelist():
            root = ET.fromstring(book.read("xl/sharedStrings.xml")); shared = ["".join(item.itertext()) for item in root.findall("m:si", NS)]
        sheets = [name for name in book.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")]
        if not sheets: raise ValueError("EXPORT_SHEET_MISSING")
        root = ET.fromstring(book.read(sheets[0])); result: list[list[str]] = []
        for row in root.findall(".//m:sheetData/m:row", NS):
            values: list[str] = []
            for cell in row.findall("m:c", NS):
                index = _letters(cell.attrib.get("r", "A1"))
                values.extend([""] * max(0, index - len(values))); values.append(_text(cell, shared))
            result.append(values)
        return result

def _number(value: str) -> int | float | None:
    value = value.strip().replace(",", "")
    if not value or value in {"-", "--", "暂无"}: return None
    unit = 1
    if value.endswith("万"): value, unit = value[:-1], 10_000
    if value.endswith("亿"): value, unit = value[:-1], 100_000_000
    try: return float(value.rstrip("%")) / 100 if value.endswith("%") else float(value) * unit
    except ValueError: return None

def _date(value: str) -> str | None:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try: return datetime.strptime(value.strip(), fmt).replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError: pass
    return None

def parse_official_export(file: Path, source: dict[str, Any]) -> dict[str, Any]:
    rows = _rows(file); header_index = next((i for i, row in enumerate(rows[:20]) if len(set(row) & set(CONTENT_HEADERS)) >= 3 or len(set(row) & set(INCOME_HEADERS)) >= 2), None)
    if header_index is None: return {"file": source, "confidence": "unknown", "quality": {"source_rows": len(rows), "accepted_rows": 0, "duplicate_rows": 0, "rejected_rows": 0, "warnings": ["HEADER_UNRECOGNIZED"]}, "datasets": {}}
    headers = rows[header_index]; mapping = {name: index for index, name in enumerate(headers) if name in CONTENT_HEADERS or name in INCOME_HEADERS}
    content = len(set(headers) & set(CONTENT_HEADERS)) >= 3; accepted: list[dict[str, Any]] = []; rejected = 0; seen: set[str] = set()
    for row in rows[header_index + 1:]:
        read = lambda name: row[mapping[name]].strip() if name in mapping and mapping[name] < len(row) else ""
        if not any(row): continue
        if content:
            title, published = read("作品名称"), _date(read("发布时间"))
            if not title or not published: rejected += 1; continue
            item_key = hashlib.sha256(f"{title}\n{published}".encode()).hexdigest()
            if item_key in seen: continue
            seen.add(item_key); metrics = {standard: _number(read(label)) for label, standard in CONTENT_HEADERS.items() if standard not in {"title", "published_at", "content_format", "review_status"} and _number(read(label)) is not None}
            accepted.append({"source_item_key": item_key, "title": title, "published_at": published, "content_format": read("体裁"), "review_status": read("审核状态"), "metrics": metrics})
        else:
            date, amount = _date(read("日期")), _number(read("收获音浪"))
            if not date or amount is None: rejected += 1; continue
            key = f"{date}:sound_wave_amount"
            if key in seen: continue
            seen.add(key); accepted.append({"metric_date": date[:10], "metric_code": "sound_wave_amount", "value": str(amount), "unit": "sound_wave"})
    return {"file": source, "confidence": "confirmed" if content or "收获音浪" in mapping else "probable", "quality": {"source_rows": max(0, len(rows) - header_index - 1), "accepted_rows": len(accepted), "duplicate_rows": 0, "rejected_rows": rejected, "warnings": []}, "datasets": {"content_metrics": accepted} if content else {"income_metrics": accepted}}
