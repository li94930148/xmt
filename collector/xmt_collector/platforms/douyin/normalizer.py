from __future__ import annotations

from typing import Any


def _number(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str) and value.replace(".", "", 1).isdigit():
        return float(value) if "." in value else int(value)
    return None


def _first_present(*values: Any) -> Any:
    return next((value for value in values if value is not None and value != ""), None)


def normalize_work(raw: dict[str, Any]) -> dict[str, Any]:
    statistics = raw.get("statistics") if isinstance(raw.get("statistics"), dict) else raw
    return {
        "item_id": str(_first_present(raw.get("item_id"), raw.get("aweme_id"), raw.get("id")) or ""),
        "title": str(_first_present(raw.get("title"), raw.get("desc"), raw.get("caption"), raw.get("item_title")) or ""),
        "published_at": _first_present(raw.get("create_time"), raw.get("publish_time")),
        "status": _first_present(raw.get("status"), raw.get("audit_status"), raw.get("status_value"), raw.get("chapter_review_status")),
        "type": _first_present(raw.get("type"), raw.get("aweme_type")),
        # Cover payloads commonly contain expiring signed URLs. They are neither
        # needed by the upload contract nor safe to emit over the worker protocol.
        "cover_uri": _cover_uri(raw.get("cover") or raw.get("cover_url")),
        "metrics": {key: _number(statistics.get(key)) for key in ("play_count", "digg_count", "comment_count", "share_count", "collect_count", "danmaku_count", "cover_click_rate", "avg_view_proportion", "new_fans") if key in statistics},
    }


def _cover_uri(value: Any) -> str | None:
    if isinstance(value, dict):
        return str(value.get("uri") or value.get("url") or "") or None
    if isinstance(value, str) and "?" not in value:
        return value
    return None


def normalize_snapshot(account: dict[str, Any], works: list[dict[str, Any]], dashboard: dict[str, Any]) -> dict[str, Any]:
    return {"schema_version": 1, "protocol_version": 1, "platform": "douyin", "account": account, "works": [normalize_work(work) for work in works], "dashboard": dashboard}


def find_work_candidates(value: Any) -> list[dict[str, Any]]:
    """Discover known XHR work arrays without hard-coding a Creator Center route."""
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"aweme_list", "work_list", "items"} and isinstance(child, list):
                found.extend(item for item in child if isinstance(item, dict) and ("aweme_id" in item or ("item_id" in item and any(name in item for name in ("desc", "title", "caption", "item_title", "create_time", "publish_time")))))
            else:
                found.extend(find_work_candidates(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(find_work_candidates(child))
    return found
