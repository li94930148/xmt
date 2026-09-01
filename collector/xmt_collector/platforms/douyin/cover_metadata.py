"""Ephemeral, aggregate-only cover metadata inspection utilities.

No URL leaves this module: callers receive counters and bounded TTL statistics.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
import time
from collections import Counter
from statistics import median
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

MAX_CANDIDATES = 4
MAX_REDIRECTS = 3
MAX_IMAGE_BYTES = 64 * 1024
IMAGE_MAGIC = (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"GIF87a", b"GIF89a", b"RIFF", b"\x00\x00\x00\x18ftyp", b"\x00\x00\x00\x1cftyp")

def cover_candidates(work: dict[str, Any]) -> list[str]:
    video = work.get("video")
    cover = work.get("cover") or work.get("cover_url") or (video.get("cover") if isinstance(video, dict) else None)
    values: list[Any] = [cover]
    result: list[str] = []
    def visit(value: Any) -> None:
        if len(result) >= MAX_CANDIDATES: return
        if isinstance(value, str):
            url = value.strip()
            parsed = urlparse(url if not url.startswith("//") else "https:" + url)
            if parsed.scheme in {"http", "https"} and parsed.netloc and parsed.username is None and parsed.password is None and url not in result: result.append(parsed.geturl())
        elif isinstance(value, list):
            for item in value: visit(item)
        elif isinstance(value, dict):
            visit(value.get("url_list") or value.get("urlList") or value.get("url") or value.get("uri"))
    visit(values)
    return result

def public_host(host: str | None) -> bool:
    if not host: return False
    try:
        addresses = {entry[4][0] for entry in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)}
        return bool(addresses) and all(not (ipaddress.ip_address(address).is_private or ipaddress.ip_address(address).is_loopback or ipaddress.ip_address(address).is_link_local or ipaddress.ip_address(address).is_reserved or ipaddress.ip_address(address).is_multicast or ipaddress.ip_address(address).is_unspecified) for address in addresses)
    except OSError: return False

def ttl_seconds(url: str, now: float | None = None) -> int | None:
    now = now or time.time(); query = parse_qs(urlparse(url).query)
    for key, values in query.items():
        if key.lower() not in {"expire", "expires", "expiry", "x-expires", "x-expire"}: continue
        for value in values:
            try:
                timestamp = float(value); timestamp = timestamp / 1000 if timestamp > 100_000_000_000 else timestamp
                if timestamp > 946_684_800: return int(timestamp - now)
            except ValueError: pass
    return None

class _RedirectGuard(HTTPRedirectHandler):
    def __init__(self) -> None: super().__init__(); self.count = 0
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, target: str) -> Any:
        self.count += 1; parsed = urlparse(target)
        if self.count > MAX_REDIRECTS or parsed.scheme not in {"http", "https"} or not public_host(parsed.hostname): raise HTTPError(target, code, "unsafe redirect", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, target)

def _probe(url: str) -> str:
    parsed = urlparse(url)
    if parsed.username is not None or parsed.password is not None or not public_host(parsed.hostname): return "forbidden"
    guard = _RedirectGuard(); request = Request(url, headers={"User-Agent":"XMT-Cover-Metadata/1.0", "Accept":"image/*"})
    try:
        request.add_header("Accept-Encoding", "identity")
        with build_opener(guard).open(request, timeout=10) as response:
            content_type = response.headers.get_content_type(); length = int(response.headers.get("Content-Length", "0") or 0)
            if length > MAX_IMAGE_BYTES: return "invalid_url"
            # Read a bounded prefix only: no decompression or image decoding.
            prefix = response.read(min(64, MAX_IMAGE_BYTES))
            return "valid_images" if content_type.startswith("image/") and any(prefix.startswith(magic) for magic in IMAGE_MAGIC) else "non_image"
    except HTTPError as error:
        return "forbidden" if error.code == 403 else "not_found" if error.code == 404 else "invalid_url"
    except (URLError, TimeoutError, OSError): return "timeout"

async def summarize_covers(account_id: str, works: list[dict[str, Any]]) -> dict[str, Any]:
    seen: set[str] = set(); with_candidates = 0; ttl: list[int] = []; counts: Counter[str] = Counter()
    for work in works:
        candidates = cover_candidates(work)
        if candidates: with_candidates += 1
        for url in candidates:
            if url in seen: continue
            seen.add(url); lifetime = ttl_seconds(url)
            if lifetime is not None:
                counts["signed"] += 1
                if lifetime <= 0: counts["expired_at_collection"] += 1
                elif lifetime <= 3600: counts["expiring"] += 1
                ttl.append(max(0, lifetime))
    semaphore = asyncio.Semaphore(2)
    async def guarded(url: str) -> str:
        async with semaphore: return await asyncio.to_thread(_probe, url)
    for outcome in await asyncio.gather(*(guarded(url) for url in seen)):
        counts[outcome] += 1
    summary = {key: counts[key] for key in ("valid_images","forbidden","not_found","non_image","timeout","invalid_url","signed","expiring","expired_at_collection")}
    result: dict[str, Any] = {"works_seen":len(works), "works_with_candidates":with_candidates, "works_without_candidates":len(works)-with_candidates, "candidates_seen":len(seen), "probe_summary":summary}
    if ttl: result["ttl_summary"] = {"minimum_seconds":min(ttl), "median_seconds":int(median(ttl)), "maximum_seconds":max(ttl)}
    return result
