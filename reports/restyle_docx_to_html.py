from __future__ import annotations

import html
import json
import shutil
from pathlib import Path
from zipfile import ZipFile

from docx import Document
from docx.document import Document as DocumentObject
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports" / "output" / "leadership_report_v1"
SOURCE_PATH = REPORT_DIR / "岚曜新媒体平台项目领导汇报初稿.docx"
WORK_SOURCE = REPORT_DIR / "_restyle_source.docx"
HTML_PATH = REPORT_DIR / "岚曜新媒体平台项目领导汇报美化版.html"
META_PATH = REPORT_DIR / "restyled_meta.json"
MEDIA_DIR = REPORT_DIR / "docx_media"
SECTION_PREFIXES = ("一、", "二、", "三、", "四、", "五、", "六、", "七、", "八、", "九、", "十、")


def copy_source() -> Path:
    shutil.copyfile(SOURCE_PATH, WORK_SOURCE)
    return WORK_SOURCE


def extract_media(docx_path: Path) -> dict[str, Path]:
    if MEDIA_DIR.exists():
        shutil.rmtree(MEDIA_DIR)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    media_map: dict[str, Path] = {}
    with ZipFile(docx_path) as zf:
        for name in zf.namelist():
            if not name.startswith("word/media/"):
                continue
            target = MEDIA_DIR / Path(name).name
            target.write_bytes(zf.read(name))
            media_map[name] = target
    return media_map


def iter_block_items(parent: DocumentObject):
    parent_elm = parent.element.body
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


def image_for_paragraph(paragraph: Paragraph, media_map: dict[str, Path]) -> str | None:
    rels = paragraph.part.rels
    for run in paragraph.runs:
        xml = run._element.xml
        if "a:blip" not in xml:
            continue
        for rel_id, rel in rels.items():
            marker = f'r:embed="{rel_id}"'
            if marker in xml and "image" in rel.reltype:
                key = str(rel.target_part.partname).lstrip("/")
                path = media_map.get(key)
                if path:
                    return path.as_uri()
    return None


def render_paragraph(paragraph: Paragraph, media_map: dict[str, Path]) -> str:
    text = paragraph.text.strip()
    image_uri = image_for_paragraph(paragraph, media_map)

    if image_uri and not text:
        return f'<figure class="figure"><img src="{image_uri}" alt="图表" /></figure>'
    if not text:
        return ""
    if text.startswith("• "):
        return f"<li>{html.escape(text[2:])}</li>"
    if text.startswith("一句话定义："):
        return f'<p class="lead"><strong>一句话定义：</strong>{html.escape(text.replace("一句话定义：", "", 1))}</p>'
    if text.startswith(("适用场景：", "表达目标：", "版本说明：")):
        return f'<p class="meta-line">{html.escape(text)}</p>'
    if text.startswith("以下信息建议你确认后补入正式汇报版本："):
        return f'<p class="note-line">{html.escape(text)}</p>'
    return f'<p class="body-text">{html.escape(text)}</p>'


def render_table(table: Table) -> str:
    rows_html = []
    warn = table.rows and table.rows[0].cells and "已确认信息" in table.rows[0].cells[0].text
    for row_idx, row in enumerate(table.rows):
        tag = "th" if row_idx == 0 else "td"
        cells = "".join(f"<{tag}>{html.escape(cell.text.strip())}</{tag}>" for cell in row.cells)
        rows_html.append(f"<tr>{cells}</tr>")
    class_name = "data-table warn-table" if warn else "data-table"
    return f'<table class="{class_name}"><tbody>{"".join(rows_html)}</tbody></table>'


def custom_future_section() -> str:
    return """
<div class="content">
  <p class="roadmap-intro">在内部验证成熟后，具备向通用产品演进的潜力。以下是我们规划的发展路径。</p>
  <h3 class="roadmap-title">产品化路径</h3>
  <div class="timeline">
    <div class="timeline-item">
      <h4>第一阶段：内部深化（当前）</h4>
      <p>持续优化现有功能，深化在团队内部的使用，积累更多业务场景和用户反馈。</p>
    </div>
    <div class="timeline-item">
      <h4>第二阶段：通用化改造</h4>
      <p>将业务规则抽象为可配置模板，支持不同行业、不同规模团队的定制化需求。核心方向：审批流模板化、角色权限配置化、功能模块可插拔。</p>
    </div>
    <div class="timeline-item">
      <h4>第三阶段：商业化探索</h4>
      <p>探索私有化部署交付、行业版本授权、SaaS 服务等多种盈利模式，将内部系统转化为公司新的业务增长点。</p>
    </div>
  </div>
  <h3 class="roadmap-title">商业化方向</h3>
  <div class="biz-grid">
    <div class="biz-card">
      <h4>私有化部署</h4>
      <p>为有数据安全要求的客户提供本地部署方案，收取实施费和维护费。</p>
    </div>
    <div class="biz-card">
      <h4>行业版本</h4>
      <p>针对 MCN、广告公司、媒体机构等不同行业推出定制版本。</p>
    </div>
    <div class="biz-card">
      <h4>SaaS 服务</h4>
      <p>提供云端托管服务，按团队规模收取订阅费。</p>
    </div>
  </div>
</div>
"""


def build_html(docx_path: Path, media_map: dict[str, Path]) -> str:
    doc = Document(str(docx_path))
    sections: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    list_open = False

    def start_section(title: str) -> dict[str, object]:
        nonlocal current
        current = {"title": title, "parts": []}
        sections.append(current)
        return current

    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            if text.startswith(SECTION_PREFIXES):
                if current and list_open:
                    current["parts"].append("</ul>")
                    list_open = False
                start_section(text)
                continue

            if current is None:
                continue

            rendered = render_paragraph(block, media_map)
            if not rendered:
                continue

            parts = current["parts"]
            if rendered.startswith("<li>"):
                if not list_open:
                    parts.append('<ul class="bullet-list">')
                    list_open = True
                parts.append(rendered)
            else:
                if list_open:
                    parts.append("</ul>")
                    list_open = False
                parts.append(rendered)
        else:
            if current is None:
                continue
            if list_open:
                current["parts"].append("</ul>")
                list_open = False
            current["parts"].append(render_table(block))

    if current and list_open:
        current["parts"].append("</ul>")

    pages: list[str] = []
    for section in sections:
        title = str(section["title"])
        if title.startswith("六、未来愿景"):
            content_html = custom_future_section()
        else:
            content_html = f'<div class="content">{"".join(section["parts"])}</div>'
        pages.append(
            f"""
            <section class="page">
              <div class="page-top">
                <div class="eyebrow">Leadership Briefing</div>
                <h1 class="page-title">{html.escape(title)}</h1>
              </div>
              {content_html}
              <div class="footer">岚曜新媒体平台｜仅优化样式，不改内容</div>
            </section>
            """
        )

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>岚曜新媒体平台项目领导汇报美化版</title>
  <style>
    @page {{ size: A4; margin: 10mm; }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(37,99,235,0.10), transparent 25%),
        linear-gradient(180deg, #edf4fb 0%, #f7fafc 100%);
      color: #1f2937;
    }}
    .page {{
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 18px;
      padding: 18mm 16mm 16mm;
      background: #fff;
      position: relative;
      overflow: hidden;
      box-shadow: 0 16px 60px rgba(15, 23, 42, 0.08);
    }}
    .page::before {{
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 12mm;
      background: linear-gradient(90deg, #2563eb 0%, #1d4ed8 45%, #0f766e 100%);
    }}
    .page::after {{
      content: "";
      position: absolute;
      right: -80px;
      top: 36px;
      width: 220px;
      height: 220px;
      background: radial-gradient(circle, rgba(37,99,235,0.10), transparent 68%);
      pointer-events: none;
    }}
    .page-top {{
      position: relative;
      z-index: 1;
      padding-top: 8mm;
      margin-bottom: 16px;
    }}
    .eyebrow {{
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: #e0ecff;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }}
    .page-title {{
      margin: 10px 0 0;
      font-size: 28px;
      color: #12337b;
      letter-spacing: 0.3px;
    }}
    .content {{
      position: relative;
      z-index: 1;
    }}
    .lead {{
      margin: 0 0 12px;
      padding: 16px 18px;
      border-radius: 18px;
      background: linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%);
      border: 1px solid #dbeafe;
      font-size: 14px;
      line-height: 1.9;
      color: #1e293b;
    }}
    .meta-line {{
      margin: 8px 0;
      font-size: 13px;
      line-height: 1.8;
      color: #475569;
    }}
    .note-line {{
      margin: 10px 0 12px;
      padding: 12px 14px;
      border-left: 4px solid #f59e0b;
      background: #fffbeb;
      color: #92400e;
      font-size: 13px;
      line-height: 1.85;
    }}
    .body-text {{
      margin: 8px 0 10px;
      font-size: 13px;
      line-height: 1.9;
      color: #334155;
    }}
    .bullet-list {{
      margin: 8px 0 12px;
      padding: 0;
      list-style: none;
    }}
    .bullet-list li {{
      margin: 0 0 10px;
      padding: 14px 16px 14px 44px;
      position: relative;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      font-size: 13px;
      line-height: 1.9;
      color: #334155;
    }}
    .bullet-list li::before {{
      content: "";
      position: absolute;
      left: 16px;
      top: 19px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%);
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
    }}
    .figure {{
      margin: 14px 0 16px;
      border-radius: 20px;
      overflow: hidden;
      border: 1px solid #dbe3ef;
      background: #f8fafc;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
    }}
    .figure img {{
      display: block;
      width: 100%;
    }}
    .data-table {{
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 16px;
      font-size: 12px;
      line-height: 1.8;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 0 0 1px #dbe3ef inset;
    }}
    .data-table th,
    .data-table td {{
      border: 1px solid #dbe3ef;
      padding: 10px 12px;
      vertical-align: top;
      text-align: left;
    }}
    .data-table th {{
      background: linear-gradient(180deg, #eaf2ff 0%, #dceaff 100%);
      color: #12337b;
      font-weight: 700;
    }}
    .data-table tr:nth-child(even) td {{
      background: #fbfdff;
    }}
    .warn-table th {{
      background: linear-gradient(180deg, #fef3c7 0%, #fde68a 100%);
      color: #92400e;
    }}
    .roadmap-intro {{
      margin: 4px 0 16px;
      font-size: 13px;
      line-height: 1.9;
      color: #475569;
    }}
    .roadmap-title {{
      margin: 18px 0 14px;
      padding-left: 12px;
      border-left: 4px solid #1d4ed8;
      font-size: 18px;
      font-weight: 700;
      color: #12337b;
    }}
    .timeline {{
      position: relative;
      margin: 8px 0 28px 16px;
      padding-left: 28px;
    }}
    .timeline::before {{
      content: "";
      position: absolute;
      left: 6px;
      top: 10px;
      bottom: 10px;
      width: 2px;
      background: linear-gradient(180deg, rgba(37,99,235,0.22) 0%, rgba(37,99,235,0.45) 100%);
    }}
    .timeline-item {{
      position: relative;
      padding: 2px 0 18px;
    }}
    .timeline-item:last-child {{
      padding-bottom: 0;
    }}
    .timeline-item::before {{
      content: "";
      position: absolute;
      left: -32px;
      top: 9px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #0f766e;
      box-shadow: 0 0 0 4px rgba(15,118,110,0.12);
    }}
    .timeline-item h4 {{
      margin: 0 0 6px;
      font-size: 14px;
      color: #0f172a;
    }}
    .timeline-item p {{
      margin: 0;
      font-size: 12.5px;
      line-height: 1.9;
      color: #334155;
    }}
    .biz-grid {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 10px;
    }}
    .biz-card {{
      min-height: 118px;
      padding: 16px 16px 14px;
      border-radius: 18px;
      border: 1px solid #d8e3f3;
      background: linear-gradient(180deg, #ffffff 0%, #f6faff 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
    }}
    .biz-card h4 {{
      margin: 0 0 10px;
      font-size: 15px;
      color: #0f172a;
    }}
    .biz-card p {{
      margin: 0;
      font-size: 12.5px;
      line-height: 1.9;
      color: #334155;
    }}
    .footer {{
      position: absolute;
      left: 16mm;
      right: 16mm;
      bottom: 8mm;
      text-align: center;
      color: #64748b;
      font-size: 10px;
    }}
  </style>
</head>
<body>
  {''.join(pages)}
</body>
</html>"""


def main() -> None:
    docx_path = copy_source()
    media_map = extract_media(docx_path)
    html_text = build_html(docx_path, media_map)
    HTML_PATH.write_text(html_text, encoding="utf-8")
    META_PATH.write_text(json.dumps({"source": str(docx_path), "html": str(HTML_PATH)}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(HTML_PATH)


if __name__ == "__main__":
    main()
