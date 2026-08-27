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
    metrics = _normalize_metrics(raw)
    return {
        "item_id": str(_first_present(raw.get("item_id"), raw.get("aweme_id"), raw.get("id")) or ""),
        "title": str(_first_present(raw.get("title"), raw.get("desc"), raw.get("caption"), raw.get("item_title")) or ""),
        "published_at": _first_present(raw.get("create_time"), raw.get("publish_time")),
        "status": _first_present(raw.get("status"), raw.get("audit_status"), raw.get("status_value"), raw.get("chapter_review_status")),
        "type": _first_present(raw.get("type"), raw.get("aweme_type")),
        # Cover payloads commonly contain expiring signed URLs. They are neither
        # needed by the upload contract nor safe to emit over the worker protocol.
        "cover_uri": _cover_uri(raw.get("cover") or raw.get("cover_url")),
        "metrics": metrics,
    }


_METRIC_ALIASES = {
    "play_count": ("play_count", "playCount", "view_count", "vv"),
    "like_count": ("like_count", "likeCount", "digg_count"),
    "comment_count": ("comment_count", "commentCount"),
    "share_count": ("share_count", "shareCount"),
    "collect_count": ("collect_count", "collectCount", "favorite_count"),
    "avg_play_duration": ("avg_play_duration", "avgPlayDuration", "avg_watch_time", "avg_view_second"),
    "completion_rate": ("completion_rate", "completionRate", "finish_rate"),
    "click_rate": ("click_rate", "clickRate", "ctr", "cover_click_rate"),
    "two_second_bounce_rate": ("two_second_bounce_rate", "twoSecondBounceRate", "bounce_rate_2s"),
    "interaction_rate": ("interaction_rate", "interactionRate"),
    "new_fans": ("new_fans", "newFans", "subscribe_count"),
    "lost_fans": ("lost_fans", "unsubscribe_count"),
    "profile_views": ("profile_views", "profileViewCount", "homepage_visit_count"),
    "fan_view_proportion": ("fan_view_proportion",),
    "avg_view_proportion": ("avg_view_proportion",),
}


def _normalize_metrics(raw: dict[str, Any]) -> dict[str, int | float]:
    # The legacy Collector merged sources in this order; later containers win.
    source: dict[str, Any] = dict(raw)
    for name in ("statistics", "stats", "metrics"):
        if isinstance(raw.get(name), dict):
            source.update(raw[name])
    result: dict[str, int | float] = {}
    for canonical, aliases in _METRIC_ALIASES.items():
        value = _first_present(*(source.get(alias) for alias in aliases))
        numeric = _number(value)
        if numeric is not None:
            result[canonical] = numeric
    return result


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


def normalize_account_metadata(captures: list[dict[str, Any]]) -> dict[str, Any]:
    """Return only fields actually observed in sanitized Creator responses."""
    fields = ("nickname", "avatar", "fans_count", "following_count", "works_count", "total_likes")
    result: dict[str, Any] = {"metadata_observed": {field: False for field in fields}}

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for field in fields:
                candidate = value.get(field)
                if candidate not in (None, "") and not result["metadata_observed"][field]:
                    if field == "avatar" and isinstance(candidate, dict):
                        candidate = candidate.get("url") or candidate.get("uri")
                    if candidate not in (None, ""):
                        result[field] = candidate
                        result["metadata_observed"][field] = True
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    for capture in captures:
        visit(capture.get("response"))
    return result
