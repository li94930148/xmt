import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContentEditor from '../components/ContentEditor';
import { ActionButton, ErrorState, GlassPanel, PageHeader, PageShell, StudioSkeletonCard } from '../components/studio';
import { getProductionSourceSnapshot, type ProductionSourceSnapshot as ProductionSourceSnapshotData } from '../api/workflow';
import { formatBeijingTime } from '../lib/utils';
import { getUserFacingErrorMessage } from '../lib/userFacingError';
import { sanitizeHtml } from '../utils/sanitizeHtml';

function parsePositiveId(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default function ProductionSourceSnapshot() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const productionId = parsePositiveId(id);
  const version = searchParams.get('version')?.trim() ?? '';
  const [snapshot, setSnapshot] = useState<ProductionSourceSnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const state = location.state as { mobileReturnTo?: unknown } | null;
  const requestedReturnPath = typeof state?.mobileReturnTo === 'string' ? state.mobileReturnTo : '';
  const returnPath = requestedReturnPath.startsWith('/') && !requestedReturnPath.startsWith('//')
    ? requestedReturnPath
    : '/production/content';

  const readSnapshot = useCallback(async () => {
    if (!productionId || !version || version.length > 64) {
      setSnapshot(null);
      setError('来源版本信息未记录，无法安全读取创作快照。');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await getProductionSourceSnapshot(productionId, version);
      setSnapshot(result);
    } catch (readError) {
      setSnapshot(null);
      setError(getUserFacingErrorMessage(readError, '暂时无法读取这份创作来源快照。'));
    } finally {
      setLoading(false);
    }
  }, [productionId, version]);

  useEffect(() => {
    void readSnapshot();
  }, [attempt, readSnapshot]);

  const content = snapshot?.content_markdown ?? snapshot?.content ?? '';

  return (
    <PageShell>
      <div className="space-y-5" data-testid="production-source-snapshot">
        <PageHeader
          title="创作来源快照"
          description="这里只显示成片、发布或归档记录所引用的精确版本，不会切换到当前稿。"
          actions={(
            <ActionButton type="button" variant="secondary" onClick={() => navigate(returnPath)}>
              返回来源页面
            </ActionButton>
          )}
        />

        {loading ? <StudioSkeletonCard /> : null}
        {!loading && error ? <ErrorState
          title="创作来源快照暂不可用"
          description={error}
          headingLevel={2}
          onRetry={() => setAttempt((current) => current + 1)}
        /> : null}
        {!loading && snapshot ? <>
          <GlassPanel className="space-y-3 p-4" aria-label="来源版本信息">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold text-studio-text-primary">{snapshot.source_topic_title || `选题 #${snapshot.source_topic_id}`}</h2>
              <span className="rounded-full border border-studio-border-soft bg-studio-surface-soft px-2.5 py-1 text-xs text-studio-text-secondary">创作稿 #{snapshot.production_id} · {snapshot.version}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-text-muted">
              <span>版本时间：{snapshot.version_timestamp ? formatBeijingTime(snapshot.version_timestamp) || '未记录' : '未记录'}</span>
              <span>记录人：{snapshot.operator_name || '未记录'}</span>
            </div>
          </GlassPanel>
          <GlassPanel className="min-w-0 p-3 sm:p-5">
            {content.trim() ? <ContentEditor
              value={sanitizeHtml(content)}
              readOnly
              mode="readonly"
              collaborationEnabled={false}
              ariaLabel={`创作来源版本 ${snapshot.version} 正文`}
              minHeight={420}
              toolbarVariant="basic"
            /> : <p className="px-2 py-6 text-sm text-studio-text-muted">该来源版本正文为空。</p>}
          </GlassPanel>
        </> : null}
      </div>
    </PageShell>
  );
}
