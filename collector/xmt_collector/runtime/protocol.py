from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from xmt_collector import PROTOCOL_VERSION


class ProtocolError(ValueError):
    pass


@dataclass(frozen=True)
class Request:
    id: str
    method: str
    params: dict[str, Any]


def parse_request(line: str) -> Request:
    try:
        raw = json.loads(line)
    except json.JSONDecodeError as error:
        raise ProtocolError("invalid_json") from error
    if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not isinstance(raw.get("method"), str):
        raise ProtocolError("invalid_request")
    params = raw.get("params", {})
    if not isinstance(params, dict):
        raise ProtocolError("invalid_params")
    return Request(raw["id"], raw["method"], params)


def event(request_id: str, name: str, data: dict[str, Any]) -> str:
    return json.dumps({"id": request_id, "event": name, "protocol_version": PROTOCOL_VERSION, "data": data}, ensure_ascii=False, separators=(",", ":"))
