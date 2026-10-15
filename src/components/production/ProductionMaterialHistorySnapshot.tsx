import ContentEditor from '@/components/ContentEditor';
import { EmptyState, GlassPanel } from '@/components/studio';

export default function ProductionMaterialHistorySnapshot({ version, snapshotHtml }: {
  version: string;
  snapshotHtml: string | null | undefined;
}) {
  const hasRecordedSnapshot = snapshotHtml !== null && snapshotHtml !== undefined;
  const materialContent = typeof snapshotHtml === 'string' ? snapshotHtml : '';
  const hasMaterialContent = hasRecordedSnapshot && materialContent.trim().length > 0;

  return (
    <GlassPanel data-testid="production-material-history-snapshot" className="min-w-0 overflow-hidden">
      <div className="border-b border-studio-border-soft px-5 py-3">
        <h2 className="text-sm font-semibold text-studio-text-primary">创作资料 · {version}</h2>
        <p className="mt-1 text-xs leading-5 text-studio-text-secondary">
          这是该版本保存时的只读资料快照，不会读取或覆盖当前资料草稿。
        </p>
      </div>
      {hasMaterialContent ? (
        <div className="max-h-[560px] overflow-y-auto overflow-x-hidden bg-[var(--editor-bg)]">
          <ContentEditor
            key={version}
            value={materialContent}
            readOnly
            mode="readonly"
            immersive
            toolbarVariant="basic"
            minHeight={240}
            className="min-h-[240px] [&_.editor-content]:px-5 [&_.editor-content]:py-5 [&_.editor-content]:text-[15px] [&_.editor-content]:leading-7 [&_.editor-content_a]:break-all"
          />
        </div>
      ) : (
        <div className="p-4">
          <EmptyState
            title={hasRecordedSnapshot ? '该版本保存时资料草稿为空' : '该历史版本没有材料快照记录'}
            description={hasRecordedSnapshot
              ? '此版本未关联创作资料内容。'
              : '不会用当前资料草稿替代历史内容；当前资料草稿只在最新版本中查看。'}
          />
        </div>
      )}
    </GlassPanel>
  );
}
