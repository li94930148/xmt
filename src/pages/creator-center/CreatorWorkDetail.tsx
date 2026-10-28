import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Gauge,
  Heart,
  MessageCircle,
  Play,
  Share2,
  TrendingUp,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getDouyinWorkReview,
  type DouyinWorkDetailData,
} from "@/api/creatorCenter";
import CreatorCoverImage from "@/components/common/CreatorCoverImage";
import {
  LineChart,
  LoadingState,
  MetricCard,
  Panel,
  asRecord,
  formatDate,
} from "./shared";

export default function CreatorWorkDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const accountUid = params.get('account_id') || undefined;
  const [data, setData] = useState<DouyinWorkDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const result = await getDouyinWorkReview(id, accountUid, signal);
      if (!signal?.aborted) setData(result);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "作品复盘加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [accountUid, id]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  if (loading && !data) return <LoadingState />;
  if (error && !data) return (
    <div className="mx-auto max-w-[1400px] space-y-5 pb-12">
      <button
        type="button"
        onClick={() => navigate("/analytics/creator-center/works")}
        className="inline-flex min-h-10 min-w-10 items-center gap-2 rounded-button px-2 py-1 text-sm text-studio-text-secondary hover:text-studio-text"
      >
        <ArrowLeft className="h-4 w-4" />
        返回作品库
      </button>
      <section role="alert" className="flex flex-col gap-3 rounded-xl border border-studio-coral/30 bg-studio-coral/10 p-5 text-sm text-studio-coral-contrast sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-semibold">作品复盘暂不可用</h1>
          <p className="mt-1">{error}。可以重新读取；不会修改作品或复盘数据。</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="xmt-btn xmt-btn-secondary shrink-0 px-4 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring disabled:opacity-60"
        >{loading ? "正在读取…" : "重试读取"}</button>
      </section>
    </div>
  );
  if (!data) return null;
  const { work, performance } = data;
  const analysis = asRecord(data.analysis?.content);
  const ai = asRecord(data.analysis?.ai);
  const suggestions = Array.isArray(ai.suggestions)
    ? ai.suggestions.map(String)
    : [];
  const keywords = Array.isArray(analysis.comment_keywords)
    ? analysis.comment_keywords.map(String)
    : [];
  const interactions = data.snapshots.map(
    (row) =>
      row.like_count + row.comment_count + row.share_count + row.collect_count,
  );
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-12">
      <button
        type="button"
        onClick={() => navigate("/analytics/creator-center/works")}
        className="inline-flex min-h-10 min-w-10 items-center gap-2 rounded-button px-2 py-1 text-sm text-studio-text-secondary hover:text-studio-text"
      >
        <ArrowLeft className="h-4 w-4" />
        返回作品库
      </button>
      <header className="flex flex-col gap-5 rounded-2xl border border-studio-border bg-studio-card p-5 sm:flex-row">
        <CreatorCoverImage
          work={work}
          accountUid={accountUid}
          loading="eager"
          className="h-44 w-full max-w-72 rounded-xl object-cover sm:w-72"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-3">
            <h1 className="min-w-0 flex-1 text-2xl font-semibold">
              {work.title}
            </h1>
            {performance.is_viral ? (
              <span className="rounded-lg bg-studio-coral/10 px-3 py-1 text-sm font-medium text-studio-coral-contrast">
                爆款
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-studio-text-secondary">
            发布于 {formatDate(work.publish_time, true)} · 时长{" "}
            {work.duration ? `${work.duration.toFixed(1)} 秒` : "接口未返回"}
          </p>
          <p className="mt-3 text-sm">
            内容分类：{data.analysis?.content_category || "未分类"} · 表现等级：
            {performance.level}
          </p>
          <a
            href={`https://www.douyin.com/video/${encodeURIComponent(work.aweme_id)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm font-medium text-studio-cyan-contrast"
          >
            打开抖音作品
          </a>
        </div>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <MetricCard
          label="表现评分"
          value={performance.score}
          icon={Gauge}
          accent="emerald"
        />
        <MetricCard label="播放" value={work.play_count} icon={Play} />
        <MetricCard
          label="点赞"
          value={work.like_count}
          icon={Heart}
          accent="rose"
        />
        <MetricCard
          label="评论"
          value={work.comment_count}
          icon={MessageCircle}
          accent="violet"
        />
        <MetricCard
          label="分享"
          value={work.share_count}
          icon={Share2}
          accent="blue"
        />
        <MetricCard
          label="互动率"
          value={`${(performance.interaction_rate * 100).toFixed(2)}%`}
          icon={TrendingUp}
          accent="emerald"
        />
        <MetricCard
          label="分享率"
          value={`${(performance.share_rate * 100).toFixed(2)}%`}
          icon={Share2}
          accent="blue"
        />
        <MetricCard
          label="完播率"
          value={
            performance.completion_rate_available
              ? `${(performance.completion_rate * 100).toFixed(2)}%`
              : "—"
          }
          icon={Clock}
          accent="violet"
        />
      </section>
      <Panel title="表现评分与爆款识别" description="综合播放与互动表现">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-studio-surface p-4">
            <span className="text-xs text-studio-text-secondary">播放得分</span>
            <p className="mt-2 font-semibold">
              {performance.score_components.play} / 50
            </p>
          </div>
          <div className="rounded-xl bg-studio-surface p-4">
            <span className="text-xs text-studio-text-secondary">互动得分</span>
            <p className="mt-2 font-semibold">
              {performance.score_components.interaction} / 25
            </p>
          </div>
          <div className="rounded-xl bg-studio-surface p-4">
            <span className="text-xs text-studio-text-secondary">分享得分</span>
            <p className="mt-2 font-semibold">
              {performance.score_components.share} / 15
            </p>
          </div>
          <div className="rounded-xl bg-studio-surface p-4">
            <span className="text-xs text-studio-text-secondary">完播得分</span>
            <p className="mt-2 font-semibold">
              {performance.score_components.completion == null
                ? "数据不可用"
                : `${performance.score_components.completion} / 10`}
            </p>
          </div>
        </div>
        {performance.is_viral ? (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-studio-text-secondary">
            {performance.viral_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-studio-text-secondary">
            当前作品未同时满足播放分位、传播质量和综合评分三项爆款门槛。
          </p>
        )}
      </Panel>
      <section className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="播放曲线"
          description={`${data.snapshots.length} 个历史快照`}
        >
          <LineChart values={data.snapshots.map((row) => row.play_count)} ariaLabel={`播放曲线，${data.snapshots.length} 个历史快照`} />
          {data.snapshots.length < 2 ? (
            <p className="mt-3 text-sm text-studio-text-secondary">
              至少完成两次同步后才能形成增长曲线。
            </p>
          ) : null}
        </Panel>
        <Panel title="互动曲线" description="点赞、评论、分享与收藏之和">
          <LineChart values={interactions} color="var(--xmt-coral)" ariaLabel={`互动曲线，${data.snapshots.length} 个历史快照`} />
          {data.snapshots.length < 2 ? (
            <p className="mt-3 text-sm text-studio-text-secondary">
              当前只有一个真实快照，不生成推测趋势。
            </p>
          ) : null}
        </Panel>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="评论关键词"
          description="只展示采集结果中实际存在的评论文本"
        >
          <div className="flex flex-wrap gap-2">
            {keywords.map((word) => (
              <span
                key={word}
                className="rounded-lg bg-studio-surface px-3 py-2 text-sm"
              >
                {word}
              </span>
            ))}
            {keywords.length === 0 ? (
              <p className="text-sm text-studio-text-secondary">暂无评论关键词</p>
            ) : null}
          </div>
        </Panel>
        <Panel title="规则总结" description="基于当前作品表现">
          <p className="text-sm leading-7">
            {String(
              ai.summary || analysis.ai_summary || "当前快照不足以生成总结。",
            )}
          </p>
        </Panel>
      </section>
      <Panel title="优化建议" description="根据当前表现生成">
        <div className="grid gap-3 sm:grid-cols-2">
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              className="flex gap-3 rounded-xl bg-studio-surface p-4"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-studio-cyan/10 text-xs font-semibold text-studio-cyan-contrast">
                {index + 1}
              </span>
              <p className="text-sm leading-6">{suggestion}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
