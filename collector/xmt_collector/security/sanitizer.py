from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_SENSITIVE_KEY = re.compile(r"(cookie|authorization|token|secret|password|csrf|session|qrcode|signature|sign|bogus|verifyfp)", re.I)
_BEARER = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.I)


def sanitize(value: Any) -> Any:
    """Remove credentials before anything reaches a manifest, log, or disk."""
    if isinstance(value, dict):
        return {str(key): "[redacted]" if _SENSITIVE_KEY.search(str(key)) else sanitize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, str):
        value = _BEARER.sub("Bearer [redacted]", value)
        parts = urlsplit(value)
        if parts.scheme and parts.netloc and parts.query:
            query = urlencode([(key, "[redacted]" if _SENSITIVE_KEY.search(key) else item) for key, item in parse_qsl(parts.query, keep_blank_values=True)])
            return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))
        return value
    return value
