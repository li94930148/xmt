import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from xmt_collector.platforms.douyin.adapter import work_data_export_target
from xmt_collector.platforms.douyin.export_parser import parse_official_export


class _ExportLocator:
    first = object()
    last = object()


class _DataCenterPage:
    def __init__(self) -> None:
        self.requested: tuple[str, bool] | None = None

    def get_by_text(self, label: str, *, exact: bool) -> _ExportLocator:
        self.requested = (label, exact)
        return _ExportLocator()


def test_work_data_export_uses_first_data_center_export_control():
    page = _DataCenterPage()

    target = work_data_export_target(page)

    assert page.requested == ("导出数据", True)
    assert target is _ExportLocator.first


def write_xlsx(path: Path, rows: list[list[object]]) -> None:
    def cell(column: int, row: int, value: object) -> str:
        name = chr(ord("A") + column)
        return f'<c r="{name}{row}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'

    sheet_rows = "".join(
        f'<row r="{index}">{"".join(cell(column, index, value) for column, value in enumerate(values))}</row>'
        for index, values in enumerate(rows, start=1)
    )
    with zipfile.ZipFile(path, "w") as workbook:
        workbook.writestr("xl/worksheets/sheet1.xml", f'<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{sheet_rows}</sheetData></worksheet>')


def test_account_daily_export_keeps_period_and_negative_platform_correction(tmp_path: Path):
    export = tmp_path / "daily.xlsx"
    write_xlsx(export, [
        ["日期", "投稿量", "总播放量", "总点赞量", "总分享量", "总评论量", "5秒完播率", "2秒跳出率", "封面点击率", "平均播放时长"],
        ["2026-09-16", 0, 3505, 38, 31, -9, "53.36%", "40.52%", "26.45%", 29.72],
    ])
    result = parse_official_export(export, {"datasetType": "account_daily", "period": "yesterday"})
    assert result["confidence"] == "confirmed"
    assert result["quality"]["accepted_rows"] == 1
    row = result["datasets"]["account_daily_metrics"][0]
    assert row["period"] == "yesterday"
    assert row["metrics"]["comments"] == -9
    assert row["metrics"]["five_second_completion_rate"] == 0.5336


def test_account_daily_export_rejects_ambiguous_period(tmp_path: Path):
    export = tmp_path / "daily.xlsx"
    write_xlsx(export, [["日期", "投稿量", "总播放量"], ["2026-09-16", 0, 1]])
    result = parse_official_export(export, {"datasetType": "account_daily"})
    assert result["datasets"] == {}
    assert result["quality"]["warnings"] == ["ACCOUNT_DAILY_PERIOD_MISSING"]
