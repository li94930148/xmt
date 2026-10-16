import React from 'react';
import type { OfficialExportQualityReport } from '../../core/types';

export default function OfficialExportQualityNotice({ quality }: { quality?: OfficialExportQualityReport }) {
  if (!quality || (quality.rejected_rows === 0 && quality.duplicate_rows === 0 && quality.warnings.length === 0)) return null;
  return <div className="error" role="status" aria-live="polite">
    官方导出解析报告：读取 {quality.source_rows} 行，接收 {quality.accepted_rows} 行，未通过 {quality.rejected_rows} 行，重复 {quality.duplicate_rows} 行。
    {quality.warnings.length ? ` ${quality.warnings.join(' ')}` : ''}
  </div>;
}
