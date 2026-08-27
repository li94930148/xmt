import hashlib
import zipfile
from pathlib import Path

from xmt_collector.manifest.writer import ManifestWriter
from xmt_collector.platforms.douyin.normalizer import normalize_work
from xmt_collector.platforms.douyin.pagination import ScrollProgress, advance_scroll


def test_export_manifest_has_sha256_and_sanitized_metadata(tmp_path: Path):
    source = tmp_path / "source.xlsx"
    with zipfile.ZipFile(source, "w") as workbook:
        workbook.writestr("xl/workbook.xml", '<workbook><sheets><sheet name="Sheet1"/></sheets></workbook>')
    saved = ManifestWriter(tmp_path / "run").save_export(source, {"authorization": "secret", "page": "内容管理"})
    assert saved["sha256"] == hashlib.sha256(source.read_bytes()).hexdigest()
    assert saved["authorization"] == "[redacted]"
    assert saved["workbookValid"] is True


def test_douyin_normalizer_preserves_unabbreviated_xhr_numbers():
    work = normalize_work({"aweme_id": "1", "desc": "作品", "statistics": {"play_count": 45923, "digg_count": "12"}})
    assert work["item_id"] == "1"
    assert work["metrics"]["play_count"] == 45923


def test_full_snapshot_scroll_requires_stable_exhaustion_not_fixed_count():
    progress = ScrollProgress()
    for _ in range(5):
        progress, exhausted = advance_scroll(progress, at_bottom=False, progressed=True)
        assert exhausted is False
    for _ in range(2):
        progress, exhausted = advance_scroll(progress, at_bottom=True, progressed=False)
        assert exhausted is False
    progress, exhausted = advance_scroll(progress, at_bottom=True, progressed=False)
    assert exhausted is True
    assert progress.iterations == 8
