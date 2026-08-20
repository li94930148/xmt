import hashlib
from pathlib import Path

from xmt_collector.manifest.writer import ManifestWriter
from xmt_collector.platforms.douyin.normalizer import normalize_work


def test_export_manifest_has_sha256_and_sanitized_metadata(tmp_path: Path):
    source = tmp_path / "source.xlsx"
    source.write_bytes(b"official export")
    saved = ManifestWriter(tmp_path / "run").save_export(source, {"authorization": "secret", "page": "内容管理"})
    assert saved["sha256"] == hashlib.sha256(b"official export").hexdigest()
    assert saved["authorization"] == "[redacted]"


def test_douyin_normalizer_preserves_unabbreviated_xhr_numbers():
    work = normalize_work({"aweme_id": "1", "desc": "作品", "statistics": {"play_count": 45923, "digg_count": "12"}})
    assert work["item_id"] == "1"
    assert work["metrics"]["play_count"] == 45923
