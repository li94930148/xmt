import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Database,
  History,
  Library,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  getCreatorCenterData,
  type CreatorCenterData,
} from "@/api/creatorCenter";
const n = (value: unknown) =>
  new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
const labels: Record<string, string> = {
  official_api: "官方 API",
  local_creator_center: "本地 Creator Agent",
  business_authorization: "经营授权",
};
export default function DouyinCreatorDataCenter() {
  const [data, setData] = useState<CreatorCenterData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    setError("");
    void getCreatorCenterData()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const ranked = useMemo(
    () =>
      [...(data?.works || [])].sort(
        (a, b) => Number(b.play_count || 0) - Number(a.play_count || 0),
      ),
    [data?.works],
  );
  const account = data?.account;
  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-studio-text-muted">
            用户本机 Chrome · 已登录创作者中心
          </p>
          <h1 className="text-2xl font-semibold">抖音创作者数据中心</h1>
        </div>
        <button
          onClick={load}
          className="rounded-lg bg-studio-primary px-4 py-2 text-white"
        >
          <RefreshCw
            className={`mr-2 inline h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          刷新数据
        </button>
      </header>
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          {error}
        </div>
      )}
      <section className="flex flex-wrap gap-2">
        {(
          data?.data_sources || [
            "official_api",
            "local_creator_center",
            "business_authorization",
          ]
        ).map((source) => (
          <span
            key={source}
            className={`rounded-full px-3 py-1 text-sm ${account?.source === source ? "bg-studio-primary text-white" : "bg-studio-surface text-studio-text-muted"}`}
          >
            {labels[source] || source}
          </span>
        ))}
      </section>
      {!loading && !account && (
        <div className="rounded-xl border border-dashed border-studio-border bg-studio-card p-10 text-center">
          <Database className="mx-auto mb-3 h-8 w-8" />
          <h2 className="font-medium">等待 Creator Agent 首次采集</h2>
          <p className="mt-2 text-sm text-studio-text-muted">
            在 Agent 中点击“立即采集”，数据将加密上传到这里。
          </p>
        </div>
      )}
      {account && (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            {[
              ["粉丝", account.fans_count],
              ["作品", ranked.length],
              [
                "累计播放",
                ranked.reduce((s, w) => s + Number(w.play_count || 0), 0),
              ],
              [
                "累计互动",
                ranked.reduce(
                  (s, w) =>
                    s +
                    Number(w.like_count || 0) +
                    Number(w.comment_count || 0),
                  0,
                ),
              ],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-studio-border bg-studio-card p-5"
              >
                <p className="text-2xl font-semibold">{n(value)}</p>
                <p className="text-sm text-studio-text-muted">{String(label)}</p>
              </div>
            ))}
          </section>
          <section className="grid gap-5 xl:grid-cols-2">
            <Panel icon={Library} title="作品库与排行榜">
              <div className="max-h-96 overflow-auto">
                {ranked.map((work, index) => (
                  <div
                    key={String(work.item_id)}
                    className="grid grid-cols-[2rem_1fr_repeat(3,5rem)] gap-2 border-b border-studio-border py-3 text-sm"
                  >
                    <b>{index + 1}</b>
                    <span className="truncate">
                      {String(work.title || "未命名作品")}
                    </span>
                    <span>播放 {n(work.play_count)}</span>
                    <span>赞 {n(work.like_count)}</span>
                    <span>评 {n(work.comment_count)}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel icon={BarChart3} title="账号趋势与内容分析">
              <JsonView value={data?.dashboard} />
            </Panel>
            <Panel icon={Users} title="粉丝画像">
              <JsonView value={data?.fans} />
            </Panel>
            <Panel icon={History} title="历史复盘">
              <div className="space-y-2">
                {data?.history.map((row, index) => (
                  <div
                    key={`${row.snapshot_time}-${index}`}
                    className="flex justify-between border-b border-studio-border py-2 text-sm"
                  >
                    <span>
                      {new Date(row.snapshot_time).toLocaleString("zh-CN")}
                    </span>
                    <span>{labels[row.source] || row.source}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof BarChart3;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-studio-border bg-studio-card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-medium">
        <Icon className="h-5 w-5" />
        {title}
      </h2>
      {children}
    </section>
  );
}
function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-studio-surface p-3 text-xs text-studio-text-muted">
      {JSON.stringify(value || {}, null, 2)}
    </pre>
  );
}
