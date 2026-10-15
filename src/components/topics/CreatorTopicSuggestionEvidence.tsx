import { Link } from 'react-router-dom';
import type { CreatorTopicSuggestion } from '../../../shared/types/creator-topic-suggestions';

export default function CreatorTopicSuggestionEvidence({ item, accountUid }: { item: CreatorTopicSuggestion; accountUid: string }) {
  return <div className="min-w-0 space-y-3 break-words text-sm">
    <p className="font-medium text-studio-text-primary">{item.direction}</p>
    <p className="text-studio-text-secondary">{item.age_band} · 特征组 {item.sample_count} 条 / 对照组 {item.baseline_count} 条。累计播放中位数 {item.median_plays.toLocaleString('zh-CN')} / {item.baseline_median_plays.toLocaleString('zh-CN')}，约 {item.play_ratio} 倍。</p>
    <details className="text-studio-text-secondary">
      <summary className="cursor-pointer py-1 text-studio-cyan-contrast">查看作品依据（两组各最多 3 条）</summary>
      {([['特征组样本', item.samples], ['不含该特征的对照样本', item.baseline_samples]] as const).map(([label, samples]) => <div key={label} className="mt-3">
        <p className="text-xs text-studio-text-muted">{label}</p>
        <ul className="mt-1 space-y-2">{samples.map(work => <li key={work.id}>
          <Link className="break-words text-studio-cyan-contrast underline underline-offset-4" to={`/analytics/creator-center/work/${work.id}?account_id=${encodeURIComponent(accountUid)}`} target="_blank" rel="noopener noreferrer">{work.title}<span className="sr-only">（新窗口查看）</span></Link>
          <span className="ml-2 text-xs">播放 {work.play_count.toLocaleString('zh-CN')}</span>
        </li>)}</ul>
      </div>)}
    </details>
  </div>;
}
