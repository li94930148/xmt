from __future__ import annotations

import asyncio
import contextlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from scrapling.fetchers import AsyncDynamicSession

from xmt_collector.capture.schema import acceptance_evidence, classify, evidence
from xmt_collector.manifest.writer import ManifestWriter
from xmt_collector.platforms.douyin.normalizer import find_work_candidates, normalize_work
from xmt_collector.security.sanitizer import sanitize

CREATOR_ORIGIN = "https://creator.douyin.com"
PAGES = {
    "首页": "/creator-micro/home",
    "内容管理": "/creator-micro/content/manage",
    "数据中心": "/creator-micro/data-center/operation",
}


class LoginRequired(RuntimeError):
    pass


class DouyinAdapter:
    """The only platform adapter. It uses normal Scrapling Dynamic sessions."""

    def __init__(self, profile: Path, run_root: Path, emit: Callable[[str, dict[str, Any]], Awaitable[None]]) -> None:
        self.profile, self.run_root, self.emit = profile, run_root, emit
        self.cancelled = False

    async def collect(self, account_id: str, scope: str) -> dict[str, Any]:
        self.profile.mkdir(parents=True, exist_ok=True)
        run = ManifestWriter(self.run_root)
        captured: list[dict[str, Any]] = []
        capability = {"platform": "douyin", "pages": []}
        async with AsyncDynamicSession(
            max_pages=1,
            headless=False,
            real_chrome=True,
            google_search=False,
            network_idle=False,
            timeout=45_000,
            user_data_dir=str(self.profile),
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
                async def inspect(page: Any) -> None:
                    nonlocal login_required
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
                        for _ in range(3):
                            await page.mouse.wheel(0, 900)
                            await page.wait_for_timeout(1_000)
                        interactions.append({"action": "limited_scroll", "target": "内容管理", "count": 3, "checkpoint": "content-scroll"})
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
        works = [work for work in (normalize_work(candidate) for candidate in candidates) if work["item_id"]]
        audit = acceptance_evidence(captured, works)
        run.write_json("audit/acceptance-evidence.json", audit)
        manifest = {"platform": "douyin", "account": account_id, "scope": scope, "captured_at": datetime.now(timezone.utc).isoformat(), "xhrResponses": len(captured), "exports": all_exports}
        run.write_json("manifest.json", manifest)
        return {"manifest": manifest, "capability": capability, "captures": captured, "works": works}

    def cancel(self) -> None:
        self.cancelled = True

    def _assert_not_cancelled(self) -> None:
        if self.cancelled:
            raise asyncio.CancelledError()
