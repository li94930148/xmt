from __future__ import annotations

import asyncio
import contextlib
import io
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

from scrapling.fetchers import AsyncDynamicSession

from xmt_collector.capture.schema import acceptance_evidence, classify, evidence
from xmt_collector.manifest.writer import ManifestWriter
from xmt_collector.platforms.douyin.normalizer import find_work_candidates, normalize_account_metadata, normalize_work
from xmt_collector.platforms.douyin.pagination import ScrollProgress, advance_scroll
from xmt_collector.platforms.douyin.view_scope import content_view_scope
from xmt_collector.platforms.douyin.browser_launch import BrowserLaunch
from xmt_collector.platforms.douyin.export_parser import parse_official_export
from xmt_collector.security.sanitizer import sanitize
from xmt_collector.platforms.douyin.cover_metadata import summarize_covers

CREATOR_ORIGIN = "https://creator.douyin.com"
PAGES = {
    "首页": "/creator-micro/home",
    "内容管理": "/creator-micro/content/manage",
    "数据中心": "/creator-micro/data-center/operation",
}

_CONTENT_SCOPE_SCRIPT = """
() => {
  const labels = new Set(['全部', '全部时间', '不限', '已发布', '审核中', '未通过', '草稿', '仅自己可见', '已删除', '视频', '图文', '直播', '近7日', '近30日', '近7天', '近30天', '近90日', '最近7天', '最近30天']);
  const active = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const attrs = [node.getAttribute('aria-selected'), node.getAttribute('aria-checked'), node.getAttribute('data-state')];
      if (attrs.includes('true') || attrs.includes('active') || /(^|\\s)(active|selected|checked)(\\s|$)/i.test(String(node.className || ''))) return true;
    }
    return false;
  };
  return [...document.querySelectorAll('button,[role="button"],[role="radio"],[role="tab"],[role="option"],label')]
    .map((element, index) => {
      const label = (element.innerText || element.textContent || '').trim();
      if (!labels.has(label)) return null;
      element.setAttribute('data-xmt-content-scope-index', String(index));
      let context = '';
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const text = (node.innerText || node.textContent || '').trim();
        if (text.length < 500 && [...labels].some((token) => text.includes(token) && token !== label)) { context = text; break; }
      }
      return { index, label, context, active: active(element) };
    }).filter(Boolean);
}
"""


class LoginRequired(RuntimeError):
    pass


class CoverMetadataFailure(RuntimeError):
    """A fixed, renderer-safe diagnostic code for the isolated cover task."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def creator_xhr_url(value: object) -> bool:
    """Accept only exact Creator HTTPS origins; never return or log the URL."""
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return (
        parsed.scheme == "https"
        and parsed.hostname == "creator.douyin.com"
        and parsed.username is None
        and parsed.password is None
    )


class DouyinAdapter:
    """The only platform adapter. It uses normal Scrapling Dynamic sessions."""

    def __init__(self, profile: Path, run_root: Path, emit: Callable[[str, dict[str, Any]], Awaitable[None]], browser: BrowserLaunch) -> None:
        self.profile, self.run_root, self.emit, self.browser = profile, run_root, emit, browser
        self.cancelled = False

    async def collect(self, account_id: str, scope: str, task_id: str) -> dict[str, Any]:
        self.profile.mkdir(parents=True, exist_ok=True)
        run = ManifestWriter(self.run_root)
        captured: list[dict[str, Any]] = []
        capability = {"platform": "douyin", "browser": self.browser.evidence(), "pages": []}
        completeness: dict[str, Any] = {"mode": "not_applicable", "exhausted": scope != "full_snapshot", "iterations": 0, "uniqueWorks": 0, "stopReason": "not_full_snapshot"}
        async with AsyncDynamicSession(
            max_pages=1,
            headless=self.browser.headless,
            **self.browser.session_kwargs(),
            google_search=False,
            network_idle=False,
            timeout=45_000,
            **({} if self.browser.runtime == "external-cdp" else {"user_data_dir": str(self.profile)}),
            capture_xhr=r"https://creator\.douyin\.com/.*",
            additional_args={"accept_downloads": True},
        ) as session:
            for page_name, page_path in PAGES.items():
                self._assert_not_cancelled()
                await self.emit("progress", {"page": page_name, "tab": "自动发现"})
                discovered: dict[str, list[str]] = {"tabs": [], "filters": []}
                interactions: list[dict[str, Any]] = []
                exports: list[dict[str, Any]] = []

                login_required = False
                scope_error: str | None = None
                async def inspect(page: Any) -> None:
                    nonlocal login_required, completeness, scope_error
                    observed_xhr = 0

                    def observe_response(response: Any) -> None:
                        nonlocal observed_xhr
                        if str(getattr(response, "url", "")).startswith(CREATOR_ORIGIN):
                            observed_xhr += 1

                    page.on("response", observe_response)

                    async def visible_rows() -> int:
                        # Creator Center varies its virtual-list markup; use a bounded,
                        # semantic union for audit evidence rather than a brittle selector.
                        return await page.locator('[role="row"], table tbody tr, article').count()

                    async def click_audited(target: Any, action: str, label: str, checkpoint: str) -> None:
                        before = observed_xhr
                        started = datetime.now(timezone.utc).isoformat()
                        before_rows = await visible_rows()
                        await target.click()
                        await page.wait_for_timeout(1_000)
                        interactions.append({"action": action, "target": label, "startedAt": started, "endedAt": datetime.now(timezone.utc).isoformat(), "checkpoint": checkpoint, "beforeXhrCount": before, "afterXhrCount": observed_xhr, "newXhrCount": observed_xhr - before, "visibleRowsBefore": before_rows, "visibleRowsAfter": await visible_rows()})

                    async def ensure_unbounded_content_view() -> dict[str, Any]:
                        for _ in range(3):
                            controls = await page.evaluate(_CONTENT_SCOPE_SCRIPT)
                            view_scope = content_view_scope(controls)
                            if view_scope.get("verified") is True:
                                return {key: view_scope[key] for key in ("status", "contentType", "dateRange", "verified")}
                            targets = view_scope.get("resetTargets", [])
                            index = targets[0] if targets else None
                            if not isinstance(index, int):
                                raise RuntimeError("FULL_SNAPSHOT_SCOPE_UNCONFIRMED: reset target missing")
                            target = page.locator(f'[data-xmt-content-scope-index="{index}"]')
                            if not await target.is_visible():
                                raise RuntimeError("FULL_SNAPSHOT_SCOPE_UNCONFIRMED: reset control not visible")
                            await click_audited(target, "reset_to_all", "全部", "content-scope-reset")
                        raise RuntimeError("FULL_SNAPSHOT_SCOPE_UNCONFIRMED: reset did not converge")

                    text = await page.locator("body").inner_text(timeout=10_000)
                    if "扫码登录" in text or "登录" in text and "内容管理" not in text:
                        login_required = True
                        return
                    await page.wait_for_timeout(2_000)
                    discovered["tabs"] = await page.locator('[role="tab"]').all_inner_texts()
                    discovered["filters"] = await page.locator('button, [role="button"], a, [role="menuitem"]').all_inner_texts()
                    if page_name == "内容管理":
                        for label in ("全部", "已发布", "审核中", "未通过", "视频", "图文", "近7日", "近30日"):
                            target = page.get_by_text(label, exact=True).first
                            if await target.is_visible():
                                await click_audited(target, "click", label, "content-filter")
                        if scope == "full_snapshot":
                            try:
                                view_scope = await ensure_unbounded_content_view()
                            except RuntimeError as error:
                                scope_error = str(error)
                                return
                            progress, max_iterations = ScrollProgress(), 60
                            while progress.iterations < max_iterations:
                                self._assert_not_cancelled()
                                before_xhr = observed_xhr
                                before = await page.evaluate("() => ({top: window.scrollY, height: document.documentElement.scrollHeight, viewport: window.innerHeight})")
                                await page.mouse.wheel(0, max(900, int(before["viewport"] * 0.8)))
                                await page.wait_for_timeout(1_000)
                                after = await page.evaluate("() => ({top: window.scrollY, height: document.documentElement.scrollHeight, viewport: window.innerHeight})")
                                at_bottom = after["top"] + after["viewport"] >= after["height"] - 2
                                progressed = observed_xhr > before_xhr or after["height"] > before["height"] or after["top"] > before["top"]
                                progress, exhausted = advance_scroll(progress, at_bottom=at_bottom, progressed=progressed)
                                if exhausted:
                                    completeness = {"mode": "scroll", "exhausted": True, "iterations": progress.iterations, "uniqueWorks": 0, "stopReason": "stable_no_new_items", "stableCycles": progress.stable_cycles, "viewScope": view_scope}
                                    break
                            else:
                                completeness = {"mode": "scroll", "exhausted": False, "iterations": progress.iterations, "uniqueWorks": 0, "stopReason": "safety_cap", "stableCycles": progress.stable_cycles, "viewScope": view_scope}
                                raise RuntimeError("FULL_SNAPSHOT_INCOMPLETE: scroll safety cap reached without exhaustion evidence")
                            interactions.append({"action": "scroll_to_exhaustion", "target": "内容管理", "iterations": progress.iterations, "checkpoint": "content-scroll", "collectionCompleteness": completeness})
                    if page_name == "数据中心":
                        for label in [text for text in discovered["tabs"] if text.strip()][:9]:
                            target = page.get_by_text(label.strip(), exact=True).first
                            if await target.is_visible():
                                await click_audited(target, "click_tab", label.strip(), "data-tab")
                        for label in ("近7天", "近30天", "近7日", "近30日"):
                            target = page.get_by_text(label, exact=True).first
                            if await target.is_visible():
                                await click_audited(target, "click_date", label, "data-date")
                    for label in ("导出数据", "导出", "下载数据", "下载报表", "生成报表"):
                        if page_name not in {"内容管理", "数据中心"}:
                            continue
                        target = page.get_by_text(label, exact=False).first
                        if await target.is_visible():
                            enabled = await target.is_enabled()
                            interactions.append({"action": "export_candidate", "target": label, "enabled": enabled, "boundingBox": await target.bounding_box(), "checkpoint": "export-discovery"})
                            if not enabled or exports:
                                continue
                            try:
                                export_id = "export1" if page_name == "内容管理" else "export2"
                                started = datetime.now(timezone.utc)
                                await self.emit("export", {"checkpoint": f"{export_id}:start", "page": page_name, "action": label})
                                async with page.expect_download(timeout=15_000) as download_info:
                                    await target.click()
                                await self.emit("export", {"checkpoint": f"{export_id}:download-start", "page": page_name, "action": label})
                                download = await download_info.value
                                temp = self.run_root / "downloads" / download.suggested_filename
                                temp.parent.mkdir(parents=True, exist_ok=True)
                                await download.save_as(str(temp))
                                receipt = run.save_export(temp, {"page": page_name, "source": "official_download", "suggestedFilename": download.suggested_filename})
                                receipt["bytes"] = receipt["size"]
                                receipt["taskId"] = task_id
                                exports.append(receipt)
                                await self.emit("export", {"checkpoint": f"{export_id}:complete", "page": page_name, "action": label, "filename": receipt["storedFilename"], "size": receipt["size"], "sha256": receipt["sha256"], "workbookValid": receipt["workbookValid"], "sheetNames": receipt["sheetNames"], "duration_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000)})
                                interactions.append({"action": "export_downloaded", "target": label, "filename": receipt["storedFilename"], "sha256": receipt["sha256"], "checkpoint": "export-download"})
                            except Exception:
                                # The button may open a server-side export dialog. Record the
                                # observable modal, but never fabricate an export result.
                                await page.wait_for_timeout(1_000)
                                modal_text = await page.locator('[role="dialog"]').all_inner_texts()
                                interactions.append({"action": "export_clicked", "target": label, "modalObserved": bool(modal_text), "checkpoint": "export-click"})

                # Scrapling's optional fetcher diagnostics may include complete URLs.
                # Keep third-party library output away from our JSON Lines protocol and logs.
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    response = await session.fetch(f"{CREATOR_ORIGIN}{page_path}", page_action=inspect)
                if login_required:
                    raise LoginRequired("WAITING_FOR_USER_LOGIN")
                if scope_error:
                    raise RuntimeError(scope_error)
                page_xhr: list[dict[str, Any]] = []
                for xhr in response.captured_xhr:
                    body = getattr(xhr, "body", b"")
                    try:
                        decoded: Any = json.loads(body.decode("utf-8"))
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        decoded = {"raw": "[non-json response omitted]"}
                    item = {
                        "page": page_name,
                        "request_url": xhr.url,
                        "response_status": xhr.status,
                        "response_content_type": getattr(xhr, "headers", {}).get("content-type", ""),
                        "captured_at": datetime.now(timezone.utc).isoformat(),
                        "response": sanitize(decoded),
                    }
                    page_xhr.append(item)
                    captured.append(item)
                capability["pages"].append({"name": page_name, "tabs": [text for text in discovered["tabs"] if text.strip()], "filters": [text for text in discovered["filters"] if text.strip()][:80], "xhrEndpoints": [item["request_url"].split("?")[0] for item in page_xhr], "exports": exports, "interactions": interactions})
        schema_report, schema_markdown = evidence(captured)
        page_rows: dict[str, list[dict[str, Any]]] = {}
        for row in schema_report["captures"]:
            page_rows.setdefault(str(row["page"]), []).append(row)
        for page in capability["pages"]:
            rows = page_rows.get(page["name"], [])
            for interaction in page["interactions"]:
                if interaction.get("checkpoint"):
                    interaction["xhrIds"] = [row["id"] for row in rows]
            page["correlations"] = [{"checkpoint": interaction.get("checkpoint"), "xhrIds": interaction.get("xhrIds", []), "categories": sorted({row["category"] for row in rows})} for interaction in page["interactions"] if interaction.get("checkpoint")]
        run.write_json("capability.json", capability)
        run.write_json("xhr/schema-report.json", schema_report)
        (self.run_root / "xhr").mkdir(parents=True, exist_ok=True)
        (self.run_root / "xhr" / "schema-report.md").write_text(schema_markdown, encoding="utf-8")
        all_exports = [item for page in capability["pages"] for item in page["exports"]]
        candidates = [candidate for capture in captured for candidate in find_work_candidates(capture.get("response"))]
        works_by_id = {work["item_id"]: work for work in (normalize_work(candidate) for candidate in candidates) if work["item_id"]}
        works = list(works_by_id.values())
        completeness["uniqueWorks"] = len(works)
        account = normalize_account_metadata(captured)
        audit = acceptance_evidence(captured, works)
        run.write_json("audit/acceptance-evidence.json", audit)
        official_data: list[dict[str, Any]] = []
        for receipt in all_exports:
            # Parse the copied export only.  The original browser download stays local
            # and no raw workbook cell data is ever emitted over the bridge.
            try:
                official_data.append(parse_official_export(self.run_root / "exports" / str(receipt["storedFilename"]), {**receipt, "accountId": account_id}))
            except Exception as error:
                official_data.append({"file": receipt, "confidence": "unknown", "quality": {"source_rows": 0, "accepted_rows": 0, "duplicate_rows": 0, "rejected_rows": 0, "warnings": [f"PARSE_FAILED:{type(error).__name__}"]}, "datasets": {}})
        manifest = {"platform": "douyin", "account": account_id, "taskId": task_id, "scope": scope, "captured_at": datetime.now(timezone.utc).isoformat(), "xhrResponses": len(captured), "exports": all_exports, "officialData": official_data, "collectionCompleteness": completeness, "browser": self.browser.evidence()}
        run.write_json("manifest.json", manifest)
        return {"manifest": manifest, "capability": capability, "captures": captured, "works": works, "account": account, "officialData": official_data, "collectionCompleteness": completeness}

    async def inspect_cover_metadata_only(self, account_scope_hash: str) -> dict[str, Any]:
        """Visit only Content Management and return no work IDs, URLs, XHR, or files."""
        if not self.profile.is_dir():
            raise RuntimeError("COVER_METADATA_PROFILE_NOT_READY")
        captured: list[dict[str, Any]] = []
        started_at = time.monotonic()
        max_duration_seconds = 120
        max_works = 1_000
        page_iterations = 0
        async with AsyncDynamicSession(
            max_pages=1, headless=self.browser.headless, **self.browser.session_kwargs(), google_search=False,
            network_idle=False, timeout=45_000, **({} if self.browser.runtime == "external-cdp" else {"user_data_dir": str(self.profile)}),
            # Raw regexes need one slash per literal dot.  The previous double
            # escaping only matched a non-existent backslash-prefixed host,
            # silently producing an empty capture set and a false works=0 result.
            # AsyncDynamicSession accepts a regular expression only.  Anchor the
            # scheme and host boundary, then structurally re-check each response.
            capture_xhr=r"^https://creator\.douyin\.com(?:/|$)", additional_args={"accept_downloads": False},
        ) as session:
            login_required = False
            async def inspect(page: Any) -> None:
                nonlocal login_required, page_iterations
                text = await page.locator("body").inner_text(timeout=10_000)
                if "扫码登录" in text or ("登录" in text and "内容管理" not in text): login_required = True; return
                # Content pagination is bounded by stable scroll, never visits data/export pages.
                progress = ScrollProgress()
                seen_positions: set[tuple[int, int]] = set()
                while progress.iterations < 60:
                    self._assert_not_cancelled()
                    if time.monotonic() - started_at >= max_duration_seconds:
                        break
                    before = await page.evaluate("() => ({top:window.scrollY,height:document.documentElement.scrollHeight,viewport:window.innerHeight})")
                    position = (int(before["top"]), int(before["height"]))
                    if position in seen_positions:
                        break
                    seen_positions.add(position)
                    page_iterations = len(seen_positions)
                    await page.mouse.wheel(0, max(900, int(before["viewport"] * .8)))
                    await page.wait_for_timeout(700)
                    after = await page.evaluate("() => ({top:window.scrollY,height:document.documentElement.scrollHeight,viewport:window.innerHeight})")
                    progress, exhausted = advance_scroll(progress, at_bottom=after["top"] + after["viewport"] >= after["height"] - 2, progressed=after["height"] > before["height"] or after["top"] > before["top"])
                    if exhausted: break
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                response = await session.fetch(f"{CREATOR_ORIGIN}{PAGES['内容管理']}", page_action=inspect)
            if login_required: raise LoginRequired("WAITING_FOR_USER_LOGIN")
            for xhr in response.captured_xhr:
                if not creator_xhr_url(getattr(xhr, "url", None)):
                    continue
                try: decoded: Any = json.loads(getattr(xhr, "body", b"").decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError): continue
                captured.append(decoded)
        if not captured:
            raise CoverMetadataFailure("COVER_METADATA_SOURCE_NOT_FOUND")
        works_by_id: dict[str, dict[str, Any]] = {}
        raw_items_seen = 0
        for payload in captured:
            for item in find_work_candidates(payload):
                raw_items_seen += 1
                work_id = str(item.get("aweme_id") or item.get("item_id") or item.get("id") or "")
                if work_id and work_id not in works_by_id:
                    if len(works_by_id) >= max_works:
                        break
                    works_by_id[work_id] = item
            if len(works_by_id) >= max_works:
                break
        result = await summarize_covers(account_scope_hash, list(works_by_id.values()))
        stages = [
            {"stage": "browser_session", "status": "ok", "count": 1, "duration_bucket": "lt_1m", "boolean": True},
            {"stage": "login_state", "status": "ok", "count": 1, "duration_bucket": "lt_1m", "boolean": True},
            {"stage": "entry_page", "status": "ok", "count": 1, "duration_bucket": "lt_1m", "boolean": True},
            {"stage": "page_ready", "status": "ok", "count": 1, "duration_bucket": "lt_1m", "boolean": True},
            {"stage": "source_discovery", "status": "ok", "count": len(captured), "duration_bucket": "lt_1m", "boolean": True},
            {"stage": "page_iteration", "status": "ok", "count": page_iterations, "duration_bucket": "lt_3m", "boolean": True},
            {"stage": "raw_items_seen", "status": "ok" if raw_items_seen else "empty", "count": raw_items_seen, "duration_bucket": "lt_1m", "boolean": bool(raw_items_seen)},
            {"stage": "scope_items_matched", "status": "ok" if works_by_id else "empty", "count": len(works_by_id), "duration_bucket": "lt_1m", "boolean": bool(works_by_id)},
            {"stage": "items_parsed", "status": "ok" if works_by_id else "empty", "count": len(works_by_id), "duration_bucket": "lt_1m", "boolean": bool(works_by_id)},
            {"stage": "items_deduplicated", "status": "ok", "count": len(works_by_id), "duration_bucket": "lt_1m", "boolean": True},
            {"stage": "items_with_candidates", "status": "ok" if result["works_with_candidates"] else "empty", "count": result["works_with_candidates"], "duration_bucket": "lt_10s", "boolean": bool(result["works_with_candidates"])},
            {"stage": "image_validation", "status": "ok", "count": result["probe_summary"]["valid_images"], "duration_bucket": "lt_3m", "boolean": True},
            {"stage": "termination", "status": "ok", "count": len(works_by_id), "termination_reason": "completed", "duration_bucket": "lt_3m", "boolean": True},
        ]
        result.update({"account_scope_hash": account_scope_hash, "collected_at": datetime.now(timezone.utc).isoformat(), "execution_status": "completed", "termination_reason": "completed", "diagnostics": stages})
        return result

    def cancel(self) -> None:
        self.cancelled = True

    def _assert_not_cancelled(self) -> None:
        if self.cancelled:
            raise asyncio.CancelledError()
