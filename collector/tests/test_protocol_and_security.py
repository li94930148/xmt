import json
import asyncio

import pytest

from xmt_collector.runtime.protocol import ProtocolError, event, parse_request
from xmt_collector.runtime.worker import Worker
from xmt_collector.security.sanitizer import sanitize


def test_protocol_requires_id_method_and_object_params():
    request = parse_request('{"id":"a","method":"health","params":{}}')
    assert request.id == "a"
    with pytest.raises(ProtocolError):
        parse_request('{"method":"health"}')
    with pytest.raises(ProtocolError):
        parse_request('{')


def test_protocol_event_is_single_json_line():
    assert json.loads(event("job", "progress", {"page": "内容管理"}))["event"] == "progress"


def test_sanitizer_removes_nested_secrets_without_removing_business_fields():
    result = sanitize({"cookie": "value", "nested": {"Authorization": "Bearer abc"}, "title": "作品"})
    assert result == {"cookie": "[redacted]", "nested": {"Authorization": "[redacted]"}, "title": "作品"}


def test_worker_accepts_health_while_collection_task_is_running():
    async def scenario():
        worker = Worker()
        events = []
        started = asyncio.Event()
        release = asyncio.Event()
        worker.emit = lambda request_id, name, data: events.append((request_id, name, data))  # type: ignore[method-assign]

        async def delayed_collect(request_id, params, method):
            started.set()
            await release.wait()

        worker.collect = delayed_collect  # type: ignore[method-assign]
        await worker.handle('{"id":"job","method":"collect","params":{}}')
        await asyncio.wait_for(started.wait(), timeout=1)
        await worker.handle('{"id":"health","method":"health","params":{}}')
        assert any(event[0] == "health" and event[1] == "completed" for event in events)
        release.set()
        await asyncio.sleep(0)

    asyncio.run(scenario())
