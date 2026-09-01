from __future__ import annotations

import asyncio
import re
import json
import logging
import sys
from pathlib import Path
from typing import Any

import scrapling
from scrapling.core.utils import set_logger

from xmt_collector import COLLECTOR_VERSION, PROTOCOL_VERSION, SCHEMA_VERSION
from xmt_collector.platforms.douyin.adapter import DouyinAdapter, LoginRequired
from xmt_collector.platforms.douyin.browser_launch import BrowserLaunchError, parse_browser_launch
from xmt_collector.runtime.protocol import ProtocolError, event, parse_request


# The frozen Windows Worker talks JSON Lines to Electron over pipes.  The
# process locale may be a legacy code page, while protocol messages contain
# Chinese text; make the wire encoding deterministic before emitting events.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


class Worker:
    def __init__(self) -> None:
        quiet_logger = logging.getLogger("xmt.collector.scrapling")
        quiet_logger.handlers = [logging.NullHandler()]
        quiet_logger.propagate = False
        quiet_logger.setLevel(logging.CRITICAL)
        set_logger(quiet_logger)
        self.running: dict[str, DouyinAdapter] = {}
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.stopping = False

    def emit(self, request_id: str, name: str, data: dict[str, Any]) -> None:
        sys.stdout.write(event(request_id, name, data) + "\n")
        sys.stdout.flush()

    async def handle(self, line: str) -> None:
        try:
            request = parse_request(line)
        except ProtocolError as error:
            self.emit("unknown", "error", {"code": str(error), "message": "Worker 请求不是有效 JSON 协议。"})
            return
        if request.method == "health":
            self.emit(request.id, "completed", {
                "ready": True,
                "collector_import": True,
                "scrapling_import": True,
                "python": sys.version.split()[0],
                "scrapling": scrapling.__version__,
                "protocol_version": PROTOCOL_VERSION,
            })
        elif request.method == "cancel":
            target = self.running.get(str(request.params.get("jobId", request.id)))
            if target:
                target.cancel()
            self.emit(request.id, "cancelled", {"accepted": bool(target)})
        elif request.method == "shutdown":
            self.stopping = True
            for adapter in self.running.values():
                adapter.cancel()
            tasks = list(self.tasks.values())
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            self.emit(request.id, "completed", {"shutdown": True})
        elif request.method == "cover_metadata_only":
            if request.id in self.tasks:
                self.emit(request.id, "error", {"code": "already_running", "message": "同一采集任务正在运行。"})
                return
            # This route is intentionally not an alias for collect/start.  New
            # worker methods must be added explicitly, otherwise they fail closed.
            task = asyncio.create_task(self.cover_metadata_only(request.id, request.params))
            self.tasks[request.id] = task
            task.add_done_callback(lambda _: self.tasks.pop(request.id, None))
        elif request.method in {"login", "collect", "start"}:
            if request.id in self.tasks:
                self.emit(request.id, "error", {"code": "already_running", "message": "同一采集任务正在运行。"})
                return
            task = asyncio.create_task(self.collect(request.id, request.params, request.method))
            self.tasks[request.id] = task
            task.add_done_callback(lambda _: self.tasks.pop(request.id, None))
        else:
            self.emit(request.id, "error", {"code": "unknown_method", "message": "不支持的 Worker 方法。"})

    async def collect(self, request_id: str, params: dict[str, Any], method: str) -> None:
        try:
            browser = parse_browser_launch(params.get("browser"))
        except BrowserLaunchError as error:
            self.emit(request_id, "error", {"code": error.code, "message": str(error)[:500]})
            return
        if params.get("platform", "douyin") != "douyin":
            self.emit(request_id, "error", {"code": "not_implemented", "message": "当前仅支持 douyin。"})
            return
        account_id = str(params.get("accountId") or "unbound")
        profile = Path(str(params.get("profilePath") or ""))
        output = Path(str(params.get("outputPath") or ""))
        if not profile.is_absolute() or not output.is_absolute():
            self.emit(request_id, "error", {"code": "invalid_path", "message": "Profile 与输出目录必须由 Creator Agent 提供绝对路径。"})
            return
        if request_id in self.running:
            self.emit(request_id, "error", {"code": "already_running", "message": "同一采集任务正在运行。"})
            return
        async def send(name: str, data: dict[str, Any]) -> None:
            self.emit(request_id, name, data)
        adapter = DouyinAdapter(profile, output / "runs" / request_id, send, browser)
        self.running[request_id] = adapter
        self.emit(request_id, "started", {"platform": "douyin", "collector": "scrapling", "mode": method, "browser": browser.evidence()})
        try:
            task_id = str(params.get("taskId") or request_id)
            result = await adapter.collect(account_id, str(params.get("scope", "audit")), task_id)
            self.emit(request_id, "capture", {"xhrResponses": result["manifest"]["xhrResponses"]})
            self.emit(request_id, "completed", {"pages": len(result["capability"]["pages"]), "tabs": sum(len(page["tabs"]) for page in result["capability"]["pages"]), "xhrResponses": result["manifest"]["xhrResponses"], "exports": result["manifest"]["exports"], "manifest": result["manifest"], "capability": result["capability"], "works": result["works"], "account": result["account"], "collectionCompleteness": result["collectionCompleteness"]})
        except LoginRequired:
            self.emit(request_id, "login_required", {"code": "WAITING_FOR_USER_LOGIN", "message": "请在 Creator Agent 专用浏览器中正常扫码或完成验证码后重试。"})
        except asyncio.CancelledError:
            self.emit(request_id, "cancelled", {"accepted": True})
        except Exception as error:
            self.emit(request_id, "error", {"code": "collector_failed", "message": str(error)[:500]})
        finally:
            self.running.pop(request_id, None)

    async def cover_metadata_only(self, request_id: str, params: dict[str, Any]) -> None:
        """Dedicated task: it never invokes collect(), manifests, exports, or upload code."""
        try:
            browser = parse_browser_launch(params.get("browser"))
            if params.get("platform") != "douyin": raise RuntimeError("not_implemented")
            account_scope_hash = str(params.get("accountScopeHash") or "")
            profile = Path(str(params.get("profilePath") or ""))
            if not re.fullmatch(r"[a-f0-9]{64}", account_scope_hash) or not profile.is_absolute(): raise RuntimeError("invalid_path")
            adapter = DouyinAdapter(profile, Path("/nonexistent-cover-metadata"), lambda _name, _data: asyncio.sleep(0), browser)
            self.running[request_id] = adapter
            self.emit(request_id, "started", {"mode": "cover_metadata_only"})
            self.emit(request_id, "completed", await adapter.inspect_cover_metadata_only(account_scope_hash))
        except LoginRequired:
            self.emit(request_id, "login_required", {"code":"WAITING_FOR_USER_LOGIN", "message":"需要正常登录后才能检查封面来源。"})
        except asyncio.CancelledError:
            # Session context teardown closes the page.  Do not invoke any shared
            # collection cleanup path because those may own snapshots or queues.
            self.emit(request_id, "cancelled", {"accepted": True})
        except Exception:
            # Third-party browser errors can contain URLs; never forward them.
            self.emit(request_id, "error", {"code":"cover_metadata_failed", "message":"封面元数据检查未完成。"})
        finally:
            self.running.pop(request_id, None)


async def main() -> None:
    worker = Worker()
    while not worker.stopping:
        line = await asyncio.to_thread(sys.stdin.readline)
        if not line:
            break
        await worker.handle(line)


if __name__ == "__main__":
    asyncio.run(main())
