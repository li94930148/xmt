from xmt_collector.runtime.worker import bounded_captures


def test_worker_capture_bridge_limits_size_and_removes_query():
    captures = [{
        "page": "work-list",
        "request_url": "https://example.invalid/list?token=secret",
        "response_status": 200,
        "captured_at": "2026-09-22T00:00:00Z",
        "response": {"items": ["x" * (129 * 1024)]},
    }]
    result = bounded_captures(captures)
    assert result[0]["url"] == "https://example.invalid/list"
    assert result[0]["response"]["truncated"] is True
    assert len(bounded_captures(captures * 121)) == 120
