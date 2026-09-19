import hashlib
import zipfile
from pathlib import Path

from xmt_collector.manifest.writer import ManifestWriter
from xmt_collector.platforms.douyin.normalizer import normalize_account_metadata, normalize_work
from xmt_collector.platforms.douyin.pagination import ScrollProgress, advance_scroll
from xmt_collector.platforms.douyin.view_scope import content_view_scope


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
    assert work["metrics"]["like_count"] == 12


def test_douyin_normalizer_restores_legacy_metric_aliases_without_missing_zeroes():
    work = normalize_work({"aweme_id": "1", "view_count": 0, "statistics": {"digg_count": 2}, "stats": {"likeCount": 3, "commentCount": 4}, "metrics": {"playCount": 5, "shareCount": 6, "favorite_count": 7}})
    assert work["metrics"] == {"play_count": 5, "like_count": 3, "comment_count": 4, "share_count": 6, "collect_count": 7}
    assert "completion_rate" not in work["metrics"]
    assert normalize_work({"aweme_id": "zero", "statistics": {"play_count": 0}})["metrics"] == {"play_count": 0}


def test_douyin_normalizer_keeps_work_status_sqlite_safe():
    assert normalize_work({"aweme_id": "scalar", "status": "published"})["status"] == "published"
    assert normalize_work({"aweme_id": "nested", "status": {"value": 2, "label": "published"}})["status"] == 2
    assert normalize_work({"aweme_id": "unsafe", "status": {"payload": {"unexpected": True}}})["status"] is None
    assert normalize_work({"aweme_id": "array", "status": ["published"]})["status"] is None
    assert normalize_work({"aweme_id": "non-finite", "status": {"value": float("nan")}})["status"] is None


def test_account_metadata_accepts_current_creator_center_aliases_without_inventing_zeroes():
    account = normalize_account_metadata([
        {"response": {"user_profile": {"nickname": "账号", "follower_count": "2163", "following_count": 44, "aweme_count": 43, "total_favorited": 16000}}}
    ])
    assert account["fans_count"] == 2163
    assert account["following_count"] == 44
    assert account["works_count"] == 43
    assert account["total_likes"] == 16000
    assert account["metadata_observed"]["fans_count"] is True
    missing = normalize_account_metadata([{"response": {"status_code": 0}}])
    assert "fans_count" not in missing
    assert missing["metadata_observed"]["fans_count"] is False


def test_content_view_scope_requires_each_unbounded_group_and_selects_its_own_all():
    controls = [
        {"index": 1, "label": "全部", "context": "状态 全部 已发布 审核中", "active": False},
        {"index": 2, "label": "已发布", "context": "状态 全部 已发布 审核中", "active": True},
        {"index": 3, "label": "全部", "context": "类型 全部 视频 图文", "active": False},
        {"index": 4, "label": "图文", "context": "类型 全部 视频 图文", "active": True},
        {"index": 5, "label": "全部时间", "context": "时间 全部时间 近7日 近30日", "active": False},
        {"index": 6, "label": "近30日", "context": "时间 全部时间 近7日 近30日", "active": True},
    ]
    scope = content_view_scope(controls)
    assert scope["verified"] is False
    assert scope["resetTargets"] == [1, 3, 5]
    controls[0]["active"], controls[1]["active"] = True, False
    controls[2]["active"], controls[3]["active"] = True, False
    controls[4]["active"], controls[5]["active"] = True, False
    scope = content_view_scope(controls)
    assert scope == {"verified": True, "resetTargets": [], "status": "all", "contentType": "all", "dateRange": "all", "reason": "all_filters_verified"}


def test_content_view_scope_fails_closed_when_a_group_cannot_be_proven():
    scope = content_view_scope([{"index": 1, "label": "全部", "context": "状态 全部 已发布", "active": True}, {"index": 2, "label": "全部", "context": "状态 全部 已发布", "active": False}, {"index": 3, "label": "已发布", "context": "状态 全部 已发布", "active": False}])
    assert scope["verified"] is False
    assert scope["status"] == "unconfirmed"


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
