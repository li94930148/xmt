from xmt_collector.platforms.douyin.adapter import _cover_identity, _validated_image_mime


def test_cover_identity_ignores_expiring_query_but_not_path():
    first = _cover_identity("https://cdn.example.test/path/cover.webp?sign=one")
    second = _cover_identity("https://cdn.example.test/path/cover.webp?sign=two")
    assert first == second
    assert first != _cover_identity("https://cdn.example.test/path/other.webp?sign=two")


def test_cover_bytes_require_matching_mime_and_magic():
    png = b"\x89PNG\r\n\x1a\n" + b"fixture"
    assert _validated_image_mime("image/png; charset=binary", png) == "image/png"
    assert _validated_image_mime("text/html", png) == ""
    assert _validated_image_mime("image/png", b"<html>") == ""
