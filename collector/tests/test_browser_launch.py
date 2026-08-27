import pytest

from xmt_collector.platforms.douyin.browser_launch import BrowserLaunchError, parse_browser_launch


def launch(browser_type="chrome", runtime="system", executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"):
    return {"type": browser_type, "engine": "chromium", "runtime": runtime, "executablePath": executable, "headless": False}


@pytest.mark.parametrize(("browser_type", "executable"), [
    ("chrome", "/opt/chrome"), ("edge", "/opt/msedge.exe"), ("brave", "/opt/brave"), ("custom", "/opt/custom-chromium"),
])
def test_chromium_system_browsers_use_the_selected_executable(browser_type, executable):
    parsed = parse_browser_launch(launch(browser_type, executable=executable))
    assert parsed.session_kwargs() == {"real_chrome": False, "executable_path": executable}
    assert parsed.evidence() == {"type": browser_type, "engine": "chromium", "runtime": "system", "launchMode": "executable_path"}


def test_playwright_chromium_uses_agent_resolved_executable():
    executable = "/opt/playwright/chromium"
    parsed = parse_browser_launch(launch("chromium", "playwright", executable))
    assert parsed.session_kwargs()["executable_path"] == executable
    assert parsed.session_kwargs()["real_chrome"] is False


def test_external_cdp_connects_instead_of_launching_a_browser():
    parsed = parse_browser_launch({"type": "edge", "engine": "chromium", "runtime": "external-cdp", "cdpEndpoint": "http://127.0.0.1:9222", "headless": False})
    assert parsed.session_kwargs() == {"real_chrome": False, "cdp_url": "http://127.0.0.1:9222"}
    assert parsed.evidence()["launchMode"] == "external_cdp"


@pytest.mark.parametrize("engine", ["firefox", "webkit"])
def test_non_chromium_is_fail_closed(engine):
    with pytest.raises(BrowserLaunchError, match="COLLECTOR_BROWSER_UNSUPPORTED"):
        parse_browser_launch({"type": engine, "engine": engine, "runtime": "playwright", "executablePath": "/opt/browser", "headless": False})


def test_invalid_path_and_unknown_enum_are_rejected():
    with pytest.raises(BrowserLaunchError, match="COLLECTOR_BROWSER_LAUNCH_FAILED"):
        parse_browser_launch(launch(executable="relative/browser"))
    with pytest.raises(BrowserLaunchError, match="COLLECTOR_BROWSER_LAUNCH_FAILED"):
        parse_browser_launch({"type": "chrome", "engine": "chromium", "runtime": "unknown", "headless": False})
