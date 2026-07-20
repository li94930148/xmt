import { ArrowUpRight, BookOpen, Database, FileText, FolderKanban, Images, Search, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { GlassPanel, PageHeader, PageShell } from '../components/studio';

const libraries = [
  {
    path: '/asset-center/projects',
    title: '项目资料库',
    description: '用于保存项目方案、选题资料与调研文件，为项目协同预留统一归集入口。',
    icon: FolderKanban,
    status: '建设中',
    futureCapabilities: ['项目文件归档', 'AI 检索', '历史资料调用'],
  },
  {
    path: '/resources',
    title: '内容档案库',
    description: '查看已完成选题、历史脚本、已发布内容及成片记录。',
    icon: FileText,
    status: '已接入现有档案',
    futureCapabilities: ['已完成选题', '历史脚本', '成片记录'],
  },
  {
    path: '/asset-center/knowledge',
    title: '知识库',
    description: '用于企业知识沉淀，预留制度规范、行业资料与案例库入口。',
    icon: BookOpen,
    status: '建设中',
    futureCapabilities: ['制度规范', '行业资料', '案例库'],
  },
  {
    path: '/asset-center/media',
    title: '素材归档',
    description: '用于归档图片、视频、音频与设计素材，等待素材管理模块接入。',
    icon: Images,
    status: '建设中',
    futureCapabilities: ['图片资产', '视频与音频', '设计素材'],
  },
];

export default function AssetCenter() {
  const location = useLocation();
  const currentLibrary = libraries.find((library) => library.path === location.pathname);

  return (
    <PageShell>
      <PageHeader title={currentLibrary?.title || '资料中心'} description="集中管理企业内容资产，让项目资料、内容档案、知识与素材可追溯、可复用。" />

      <GlassPanel className="overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-studio-border-soft px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-studio-primary/12 text-studio-cyan">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-studio-text-primary">企业内容资产沉淀中心</p>
              <p className="mt-1 text-xs text-studio-text-muted">资料检索功能建设中。知识库搜索与向量检索接口已预留，本阶段不启用 AI 写入与索引任务。</p>
            </div>
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-text-muted" />
            <input aria-label="资料检索功能建设中" placeholder="资料检索功能建设中" disabled className="w-full rounded-button border border-studio-border-soft bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-studio-text-muted outline-none disabled:cursor-not-allowed" />
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-studio-border-soft md:grid-cols-2 md:divide-x md:divide-y-0">
          {libraries.map((library) => {
            const Icon = library.icon;
            const isCurrent = location.pathname === library.path;
            return (
              <Link key={library.path} to={library.path} className={`group flex min-h-44 gap-4 p-5 transition-colors ${isCurrent ? 'bg-studio-primary/10' : 'hover:bg-white/[0.04]'}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-studio-cyan"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3"><span className="text-base font-semibold text-studio-text-primary">{library.title}</span><ArrowUpRight className="h-4 w-4 shrink-0 text-studio-text-muted transition group-hover:text-studio-cyan" /></span>
                  <span className="mt-2 block text-sm leading-6 text-studio-text-secondary">{library.description}</span>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs text-studio-text-muted"><Sparkles className="h-3.5 w-3.5 text-studio-cyan" />{library.status}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </GlassPanel>

      {currentLibrary && currentLibrary.path !== '/resources' ? (
        <GlassPanel className="p-5">
          <h2 className="text-base font-semibold text-studio-text-primary">{currentLibrary.title}建设说明</h2>
          <p className="mt-2 text-sm leading-6 text-studio-text-secondary">当前提供导航、分类与检索能力边界的页面框架。数据写入、素材上传、知识向量化将通过后续接口接入，现有业务数据不迁移、不改写。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {currentLibrary.futureCapabilities.map((capability) => <span key={capability} className="rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-1.5 text-xs text-studio-text-secondary">{capability}</span>)}
          </div>
        </GlassPanel>
      ) : null}
    </PageShell>
  );
}
