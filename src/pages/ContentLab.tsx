import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, BookOpenCheck, Sparkles, Users, Workflow } from 'lucide-react';
import { ActionButton, PageHeader, PageShell } from '../components/studio';

const panels = [
  { id: 'overview', label: '内容运行', icon: Workflow, Component: lazy(() => import('./ContentOSDashboard')) },
  { id: 'insights', label: '内容洞察', icon: Activity, Component: lazy(() => import('./ContentIntelligenceDashboard')) },
  { id: 'generation', label: '创作建议', icon: Sparkles, Component: lazy(() => import('./ContentGenerationDashboard')) },
  { id: 'collaboration-timeline', label: '协作动态', icon: Users, Component: lazy(() => import('./CollaborationDashboard')) },
  { id: 'collaboration-experience', label: '协作体验', icon: BookOpenCheck, Component: lazy(() => import('./CollaborationUX')) },
] as const;

type PanelId = (typeof panels)[number]['id'];

export default function ContentLab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPanel = searchParams.get('tab');
  const activePanel = panels.find((panel) => panel.id === requestedPanel) || panels[0];
  const ActivePanel = activePanel.Component;

  const selectPanel = (id: PanelId) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', id);
      return next;
    });
  };

  return (
    <PageShell>
      <PageHeader title="内容实验室" description="集中查看内容运行、洞察、创作建议与协作过程；这些分析面板只读，不会直接改写稿件。" />
      <nav aria-label="内容实验室视图" className="flex min-w-0 flex-wrap gap-2 rounded-panel border border-studio-border-soft bg-studio-surface-glass p-3">
        {panels.map((panel) => {
          const Icon = panel.icon;
          const selected = activePanel.id === panel.id;
          return (
            <ActionButton
              key={panel.id}
              type="button"
              aria-pressed={selected}
              variant={selected ? 'primary' : 'secondary'}
              className="min-w-0 px-3 py-2 text-sm"
              onClick={() => selectPanel(panel.id)}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {panel.label}
            </ActionButton>
          );
        })}
      </nav>
      <section aria-label={activePanel.label}>
        <Suspense fallback={<div role="status" className="rounded-panel border border-studio-border-soft bg-studio-surface-soft p-6 text-sm text-studio-text-muted">正在打开内容实验室…</div>}>
          <ActivePanel key={activePanel.id} />
        </Suspense>
      </section>
    </PageShell>
  );
}
