import { ArrowUpRight, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GlassPanel } from '../studio';
import { sanitizeHtml } from '../../utils/sanitizeHtml';

type ProductionOriginPanelProps = {
  sourceType?: 'topic_outline' | null;
  sourceSnapshot?: string | null;
  sourceOutlineVersion?: string | null;
  sourceTopicId?: number | null;
};

export default function ProductionOriginPanel({ sourceType, sourceSnapshot, sourceOutlineVersion, sourceTopicId }: ProductionOriginPanelProps) {
  const hasVerifiedTopicOutline = sourceType === 'topic_outline' && typeof sourceSnapshot === 'string';

  return (
    <GlassPanel className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-studio-cyan-contrast" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-studio-text-primary">创作来源</h2>
      </div>
      {hasVerifiedTopicOutline ? (
        <>
          <p className="text-xs leading-relaxed text-studio-text-secondary">
            初稿创建时引用了选题大纲。后续大纲或正文修改不会改变这份快照。
          </p>
          {sourceOutlineVersion ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs font-medium text-studio-text-primary">来源版本：{sourceOutlineVersion}</p>
              {sourceTopicId ? (
                <Link
                  to={`/topics/${sourceTopicId}?outlineVersion=${encodeURIComponent(sourceOutlineVersion)}`}
                  className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-studio-cyan-contrast underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring"
                >
                  查看来源大纲版本
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-studio-text-muted">创建时没有可唯一对应的显式大纲版本，快照保留但不推断版本号。</p>
          )}
          <details className="rounded-xl border border-studio-border-soft bg-studio-surface-soft/70 p-3">
            <summary className="cursor-pointer text-sm font-medium text-studio-text-primary">
              查看创建时的大纲快照
            </summary>
            {sourceSnapshot ? (
              <div
                className="mt-3 break-words text-sm leading-relaxed text-studio-text-secondary [&_a]:text-studio-cyan-contrast [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(sourceSnapshot) }}
              />
            ) : (
              <p className="mt-3 text-sm text-studio-text-muted">创建时的大纲为空。</p>
            )}
          </details>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-studio-text-secondary">
          该创作记录没有可验证的来源快照；不会用当前选题大纲推断旧来源。
        </p>
      )}
    </GlassPanel>
  );
}
