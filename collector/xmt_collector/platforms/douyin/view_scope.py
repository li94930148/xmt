from __future__ import annotations

from typing import Any


_GROUPS = {
    "status": ("已发布", "审核中", "未通过", "草稿", "仅自己可见", "已删除"),
    "contentType": ("视频", "图文", "直播"),
    "dateRange": ("近7日", "近30日", "近7天", "近30天", "近90日", "最近7天", "最近30天"),
}
_ALL = {"全部", "全部时间", "所有时间", "不限"}


def _text(value: Any) -> str:
    return "".join(str(value or "").split())


def _group(control: dict[str, Any]) -> str | None:
    label, context = _text(control.get("label")), _text(control.get("context"))
    if label in {"全部时间", "所有时间"}:
        return "dateRange"
    matches = [name for name, labels in _GROUPS.items() if label in labels or any(token in context for token in labels)]
    return matches[0] if len(matches) == 1 else None


def content_view_scope(controls: list[dict[str, Any]]) -> dict[str, Any]:
    """Return fail-closed evidence and reset targets for the content filters."""
    grouped: dict[str, list[dict[str, Any]]] = {name: [] for name in _GROUPS}
    for control in controls:
        group = _group(control)
        if group:
            grouped[group].append(control)
    result: dict[str, Any] = {"verified": True, "resetTargets": []}
    for group, candidates in grouped.items():
        # Some Creator Center variants do not render a content-type group at
        # all. Its absence is unbounded, whereas an ambiguous rendered group is
        # not safe to assume and remains fail-closed below.
        if not candidates:
            result[group] = "all"
            continue
        all_controls = [item for item in candidates if _text(item.get("label")) in _ALL]
        restricted_active = [item for item in candidates if _text(item.get("label")) not in _ALL and item.get("active") is True]
        active_all = [item for item in all_controls if item.get("active") is True]
        verified = len(all_controls) == 1 and len(active_all) == 1 and not restricted_active
        result[group] = "all" if verified else "unconfirmed"
        if len(all_controls) != 1:
            result["verified"] = False
            result["reason"] = f"{group}_all_control_ambiguous"
        elif not verified:
            result["verified"] = False
            result["resetTargets"].append(all_controls[0].get("index"))
    if result["verified"]:
        result["reason"] = "all_filters_verified"
    return result
