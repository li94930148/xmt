from __future__ import annotations

import hashlib
from collections import Counter
from typing import Any
from urllib.parse import urlsplit


def _paths(value: Any, prefix: str = "", depth: int = 0) -> set[str]:
    if depth > 5:
        return {prefix}
    if isinstance(value, dict):
        result: set[str] = set()
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            result.add(path)
            result.update(_paths(item, path, depth + 1))
        return result
    if isinstance(value, list):
        return _paths(value[0], f"{prefix}[]", depth + 1) if value else {f"{prefix}[]"}
    return {prefix}


def classify(url: str, response: Any) -> str:
    fields = " ".join(_paths(response)).lower()
    if any(token in fields for token in ("aweme_list", "work_list", "audit_status", "create_time")):
        return "CONTENT_LIST"
    if any(token in fields for token in ("trend", "date_list", "series", "x_axis", "playcnt")):
        return "TREND_METRIC"
    if any(token in fields for token in ("fans", "digg", "play_count", "current_count", "ownvalue")):
        return "ACCOUNT_METRIC"
    path = urlsplit(url).path.lower()
    if "export" in path or "download" in path:
        return "EXPORT_DOWNLOAD" if "download" in path else "EXPORT_TASK"
    return "UNKNOWN"


def evidence(captures: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
    rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    for capture in captures:
        url = urlsplit(str(capture["request_url"]))._replace(query="", fragment="").geturl()
        fields = sorted(_paths(capture["response"]))
        category = classify(url, capture["response"])
        counts[category] += 1
        rows.append({
            "id": hashlib.sha256(f"{capture['page']}|{url}|{','.join(fields)}".encode()).hexdigest()[:16],
            "page": capture["page"], "endpoint": url, "status": capture["response_status"],
            "category": category, "schemaFields": fields[:160],
        })
    report = {"method": "shape-first", "total": len(rows), "categories": dict(counts), "captures": rows}
    lines = ["# 抖音 Creator XHR Schema 报告", "", "仅保存路径、状态与结构字段；不保存完整 XHR 或响应值。", "", "| 类别 | 数量 |", "| --- | ---: |"]
    lines.extend(f"| {kind} | {count} |" for kind, count in sorted(counts.items()))
    lines += ["", "## 端点", ""]
    lines.extend(f"- `{row['category']}` {row['endpoint']}（{row['page']}，HTTP {row['status']}）" for row in rows)
    return report, "\n".join(lines) + "\n"


def acceptance_evidence(captures: list[dict[str, Any]], works: list[dict[str, Any]]) -> dict[str, Any]:
    """Persist the smallest user-authorized proof set, never a raw response."""
    work_sample = [{key: work.get(key) for key in ("item_id", "title", "published_at", "status")} for work in works[:3]]
    dashboard_metrics: list[dict[str, Any]] = []
    trend_points: list[dict[str, Any]] = []
    for capture in captures:
        response = capture.get("response")
        if not isinstance(response, dict):
            continue
        metrics = response.get("metrics")
        if not isinstance(metrics, list):
            continue
        for metric in metrics:
            if not isinstance(metric, dict):
                continue
            if "metric_value" in metric:
                dashboard_metrics.append({"name": metric.get("english_metric_name") or metric.get("metric_name"), "value": metric.get("metric_value")})
            for point in metric.get("trends", []) if isinstance(metric.get("trends"), list) else []:
                if isinstance(point, dict) and "date_time" in point and "value" in point:
                    trend_points.append({"metric": metric.get("english_metric_name") or metric.get("metric_name"), "date": point.get("date_time"), "value": point.get("value")})
    return {
        "content": {"verified": len(work_sample) >= 3 and all(all(sample.get(key) not in (None, "") for key in ("item_id", "title", "published_at", "status")) for sample in work_sample), "sample": work_sample},
        "dataCenter": {"verified": bool(dashboard_metrics) and len(trend_points) >= 3, "exactMetrics": dashboard_metrics[:8], "trendPoints": trend_points[:3]},
    }
