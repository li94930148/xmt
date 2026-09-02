from xmt_collector.platforms.douyin import cover_metadata
from xmt_collector.platforms.douyin.cover_metadata import cover_candidates, ttl_seconds
from xmt_collector.platforms.douyin.adapter import creator_xhr_url
from pathlib import Path
import re

def test_cover_candidates_only_returns_unique_http_urls():
    value={"cover":{"url_list":["https://image.example/a","https://image.example/a","javascript:bad"]}}
    assert cover_candidates(value)==["https://image.example/a"]

def test_cover_candidates_rejects_credentials_and_local_schemes():
    value={"cover":{"url_list":["https://u:p@image.example/a","file:///tmp/a","http://127.0.0.1/a"]}}
    assert cover_candidates(value)==["http://127.0.0.1/a"]

def test_probe_rejects_credentials_and_private_dns_without_a_request(monkeypatch):
    called = False
    def no_network(*_args, **_kwargs):
        nonlocal called; called = True
        raise AssertionError("network must not be opened")
    monkeypatch.setattr(cover_metadata, "public_host", lambda _host: False)
    monkeypatch.setattr(cover_metadata, "build_opener", no_network)
    assert cover_metadata._probe("https://user:pass@public.example/cover") == "forbidden"
    assert cover_metadata._probe("https://public.example/cover") == "forbidden"
    assert called is False

def test_private_and_rebinding_dns_are_not_public(monkeypatch):
    monkeypatch.setattr(cover_metadata.socket, "getaddrinfo", lambda *_args, **_kwargs: [(None, None, None, None, ("127.0.0.1", 0))])
    assert cover_metadata.public_host("image.example") is False
    monkeypatch.setattr(cover_metadata.socket, "getaddrinfo", lambda *_args, **_kwargs: [(None, None, None, None, ("8.8.8.8", 0)), (None, None, None, None, ("10.0.0.1", 0))])
    assert cover_metadata.public_host("rebind.example") is False

def test_ttl_is_aggregate_only_and_parses_epoch():
    assert ttl_seconds("https://image.example/a?expires=946684910", now=946684900)==10

def test_worker_route_is_explicit_and_unknown_modes_fail_closed():
    worker = Path(__file__).parents[1] / "xmt_collector" / "runtime" / "worker.py"
    source = worker.read_text(encoding="utf-8")
    assert 'elif request.method == "cover_metadata_only"' in source
    assert 'elif request.method in {"login", "collect", "start"}' in source
    assert '"unknown_method"' in source
    assert "self.collect(request.id, request.params, request.method)" not in source.split('elif request.method == "cover_metadata_only"', 1)[1].split('elif request.method in {"login", "collect", "start"}', 1)[0]

def test_creator_xhr_pattern_regression_and_exact_origin_filter():
    old = re.compile(r"https://creator\\.douyin\\.com/.*")
    fixed = re.compile(r"^https://creator\.douyin\.com(?:/|$)")
    assert old.fullmatch("https://creator.douyin.com/path") is None
    for value in ["https://creator.douyin.com/path", "https://creator.douyin.com/path?x=fixture"]:
        assert fixed.match(value)
        assert creator_xhr_url(value)
    for value in ["http://creator.douyin.com/path", "https://creator.douyin.com.evil.example/path", "https://user:pass@creator.douyin.com/path", "https://sub.creator.douyin.com/path", r"https://creator\.douyin\.com/path"]:
        assert fixed.match(value) is None or not creator_xhr_url(value)
        assert not creator_xhr_url(value)

def test_metadata_only_source_failure_is_a_fixed_code_not_empty_success():
    worker = Path(__file__).parents[1] / "xmt_collector" / "runtime" / "worker.py"
    source = worker.read_text(encoding="utf-8")
    adapter = Path(__file__).parents[1] / "xmt_collector" / "platforms" / "douyin" / "adapter.py"
    assert 'CoverMetadataFailure("COVER_METADATA_SOURCE_NOT_FOUND")' in adapter.read_text(encoding="utf-8")
    assert 'failed(error.code, "source_not_found")' in source
    assert '"execution_status": "failed"' in source
