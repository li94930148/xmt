from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

import scrapling
from scrapling.core.utils import set_logger

from xmt_collector import COLLECTOR_VERSION, PROTOCOL_VERSION, SCHEMA_VERSION
from xmt_collector.platforms.douyin.adapter import DouyinAdapter, LoginRequired
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
        adapter = DouyinAdapter(profile, output / "runs" / request_id, send)
        self.running[request_id] = adapter
        self.emit(request_id, "started", {"platform": "douyin", "collector": "scrapling", "mode": method})
        try:
            result = await adapter.collect(account_id, str(params.get("scope", "audit")))
            self.emit(request_id, "capture", {"xhrResponses": result["manifest"]["xhrResponses"]})
            self.emit(request_id, "completed", {"pages": len(result["capability"]["pages"]), "tabs": sum(len(page["tabs"]) for page in result["capability"]["pages"]), "xhrResponses": result["manifest"]["xhrResponses"], "exports": len(result["manifest"]["exports"]), "manifest": result["manifest"], "capability": result["capability"], "works": result["works"], "account": result["account"], "collectionCompleteness": result["collectionCompleteness"]})
        except LoginRequired:
            self.emit(request_id, "login_required", {"code": "WAITING_FOR_USER_LOGIN", "message": "请在 Creator Agent 专用 Chrome 中正常扫码或完成验证码后重试。"})
        except asyncio.CancelledError:
            self.emit(request_id, "cancelled", {"accepted": True})
        except Exception as error:
            self.emit(request_id, "error", {"code": "collector_failed", "message": str(error)[:500]})
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
