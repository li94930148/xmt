from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

BrowserType = Literal["chrome", "chromium", "edge", "brave", "arc", "firefox", "webkit", "custom"]
BrowserEngine = Literal["chromium", "firefox", "webkit"]
BrowserRuntime = Literal["system", "playwright", "external-cdp"]


class BrowserLaunchError(ValueError):
    def __init__(self, code: str, browser_type: str, engine: str, runtime: str, message: str) -> None:
        super().__init__(f"{code}: {message} (type={browser_type}, engine={engine}, runtime={runtime})")
        self.code = code


@dataclass(frozen=True)
class BrowserLaunch:
    browser_type: BrowserType
    engine: BrowserEngine
    runtime: BrowserRuntime
    executable_path: str | None
    cdp_endpoint: str | None
    headless: bool

    @property
    def launch_mode(self) -> str:
        return "external_cdp" if self.runtime == "external-cdp" else "executable_path"

    def evidence(self) -> dict[str, str]:
        return {"type": self.browser_type, "engine": self.engine, "runtime": self.runtime, "launchMode": self.launch_mode}

    def session_kwargs(self) -> dict[str, Any]:
        if self.runtime == "external-cdp":
            return {"real_chrome": False, "cdp_url": self.cdp_endpoint}
        return {"real_chrome": False, "executable_path": self.executable_path}


def parse_browser_launch(value: Any) -> BrowserLaunch:
    if not isinstance(value, dict):
        raise BrowserLaunchError("COLLECTOR_BROWSER_LAUNCH_FAILED", "unknown", "unknown", "unknown", "浏览器启动描述无效")
    browser_type, engine, runtime = str(value.get("type", "unknown")), str(value.get("engine", "unknown")), str(value.get("runtime", "unknown"))
    types = {"chrome", "chromium", "edge", "brave", "arc", "firefox", "webkit", "custom"}
    engines = {"chromium", "firefox", "webkit"}
    runtimes = {"system", "playwright", "external-cdp"}
    if browser_type not in types or engine not in engines or runtime not in runtimes:
        raise BrowserLaunchError("COLLECTOR_BROWSER_LAUNCH_FAILED", browser_type, engine, runtime, "浏览器启动描述包含未知枚举")
    if engine != "chromium":
        raise BrowserLaunchError("COLLECTOR_BROWSER_UNSUPPORTED", browser_type, engine, runtime, "Scrapling Creator Collector 仅支持 Chromium-compatible 浏览器")
    headless = value.get("headless")
    if not isinstance(headless, bool):
        raise BrowserLaunchError("COLLECTOR_BROWSER_LAUNCH_FAILED", browser_type, engine, runtime, "headless 必须为布尔值")
    if runtime == "external-cdp":
        endpoint = value.get("cdpEndpoint")
        parsed = urlparse(endpoint) if isinstance(endpoint, str) else None
        if not endpoint or not parsed or parsed.scheme not in {"ws", "wss", "http", "https"} or not parsed.netloc:
            raise BrowserLaunchError("COLLECTOR_BROWSER_LAUNCH_FAILED", browser_type, engine, runtime, "external-cdp 缺少有效 endpoint")
        return BrowserLaunch(browser_type, engine, runtime, None, endpoint, headless)
    executable = value.get("executablePath")
    if not isinstance(executable, str) or not Path(executable).is_absolute():
        raise BrowserLaunchError("COLLECTOR_BROWSER_LAUNCH_FAILED", browser_type, engine, runtime, "Chromium 启动路径必须为绝对路径")
    return BrowserLaunch(browser_type, engine, runtime, executable, None, headless)
