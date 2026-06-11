import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { useAuthStore } from '../store';
import {
  getDouyinAccounts, addDouyinAccount, deleteDouyinAccount,
  scrapeDouyin, getDouyinSnapshots, getDouyinVideos, getDouyinTrend,
} from '../api';
import type { DouyinAccount, DouyinSnapshot, DouyinVideo } from '../api';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { formatBeijingTime } from '../lib/utils';
import {
  Plus, RefreshCw, Trash2, TrendingUp, Users, Heart, Video,
  ChevronDown, ChevronUp, ExternalLink, BarChart3, X, Loader2
} from 'lucide-react';

export default function DouyinAnalytics() {
  const [accounts, setAccounts] = useState<DouyinAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<DouyinSnapshot[]>([]);
  const [videos, setVideos] = useState<DouyinVideo[]>([]);
  const [trend, setTrend] = useState<DouyinSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccount, setNewAccount] = useState({ name: '', profileUrl: '' });
  const [expandedSnapshot, setExpandedSnapshot] = useState<number | null>(null);
  const appStore = useAppStore();
  const authStore = useAuthStore();
  const styles = useThemeStyles();
  const isAdmin = authStore.user?.role === 'admin' || authStore.user?.role === 'director';

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await getDouyinAccounts();
      setAccounts(data);
      if (data.length > 0 && !selectedAccount) {
        setSelectedAccount(Number(data[0].id));
      }
    } catch (error) {
      appStore.addNotification({ title: '错误', message: '获取账号列表失败', type: 'error' });
    }
  }, []);

  const fetchSnapshots = useCallback(async (accountId: number) => {
    setLoading(true);
    try {
      const [snapData, trendData] = await Promise.all([
        getDouyinSnapshots(accountId, 10),
        getDouyinTrend(accountId, 90),
      ]);
      setSnapshots(snapData);
      setTrend(trendData);
    } catch (error) {
      appStore.addNotification({ title: '错误', message: '获取数据失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, []);

  useEffect(() => {
    if (selectedAccount) fetchSnapshots(selectedAccount);
  }, [selectedAccount]);

  const handleAddAccount = async () => {
    if (!newAccount.name.trim() || !newAccount.profileUrl.trim()) {
      appStore.addNotification({ title: '提示', message: '请填写完整信息', type: 'warning' });
      return;
    }
    try {
      await addDouyinAccount(newAccount);
      appStore.addNotification({ title: '成功', message: '账号添加成功', type: 'success' });
      setShowAddModal(false);
      setNewAccount({ name: '', profileUrl: '' });
      fetchAccounts();
    } catch (error) {
      appStore.addNotification({ title: '错误', message: '添加失败', type: 'error' });
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!confirm('确定删除该账号？所有历史数据将一并删除。')) return;
    try {
      await deleteDouyinAccount(id);
      appStore.addNotification({ title: '成功', message: '账号已删除', type: 'success' });
      if (selectedAccount === id) setSelectedAccount(null);
      fetchAccounts();
    } catch (error) {
      appStore.addNotification({ title: '错误', message: '删除失败', type: 'error' });
    }
  };

  const handleScrape = async () => {
    if (!selectedAccount) return;
    setScraping(true);
    try {
      await scrapeDouyin(selectedAccount);
      appStore.addNotification({ title: '成功', message: '数据抓取完成', type: 'success' });
      fetchSnapshots(selectedAccount);
    } catch (error) {
      appStore.addNotification({ title: '错误', message: (error as Error).message, type: 'error' });
    } finally {
      setScraping(false);
    }
  };

  const handleShowVideos = async (snapshotId: number) => {
    if (expandedSnapshot === snapshotId) {
      setExpandedSnapshot(null);
      setVideos([]);
      return;
    }
    try {
      const data = await getDouyinVideos(snapshotId);
      setVideos(data);
      setExpandedSnapshot(snapshotId);
    } catch (error) {
      appStore.addNotification({ title: '错误', message: '获取视频列表失败', type: 'error' });
    }
  };

  const latestSnapshot = snapshots[0];
  const prevSnapshot = snapshots[1];
  const followerDiff = latestSnapshot && prevSnapshot
    ? Number(latestSnapshot.followers) - Number(prevSnapshot.followers)
    : 0;
  const likeDiff = latestSnapshot && prevSnapshot
    ? Number(latestSnapshot.likes) - Number(prevSnapshot.likes)
    : 0;

  const currentAccount = accounts.find(a => Number(a.id) === selectedAccount);

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={styles.pageTitle}>抖音数据分析</h1>
          <p className={`${styles.subtitle} mt-1`}>追踪账号数据变化，分析内容表现</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className={`flex items-center gap-2 px-4 py-2.5 ${styles.buttonSecondary} rounded-xl text-sm`}
            >
              <Plus className="w-4 h-4" />
              添加账号
            </button>
          )}
          {selectedAccount && (
            <button
              onClick={handleScrape}
              disabled={scraping}
              className={`flex items-center gap-2 px-4 py-2.5 ${styles.buttonPrimary} rounded-xl text-sm disabled:opacity-50`}
            >
              {scraping ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {scraping ? '抓取中...' : '立即抓取'}
            </button>
          )}
        </div>
      </div>

      {/* 账号选择 */}
      {accounts.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {accounts.map(account => (
            <button
              key={account.id}
              onClick={() => setSelectedAccount(Number(account.id))}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all ${
                selectedAccount === Number(account.id)
                  ? styles.buttonPrimary
                  : styles.buttonSecondary
              }`}
            >
              {account.name}
              {isAdmin && (
                <Trash2
                  className="w-3.5 h-3.5 opacity-50 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); handleDeleteAccount(Number(account.id)); }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {accounts.length === 0 && (
        <div className={`${styles.card} p-12 text-center`}>
          <BarChart3 className={`w-12 h-12 ${styles.textMuted} mx-auto mb-4`} />
          <h3 className={`text-lg font-medium ${styles.textPrimary} mb-2`}>还没有添加抖音账号</h3>
          <p className={`${styles.textSecondary} mb-4`}>点击「添加账号」开始追踪抖音数据</p>
        </div>
      )}

      {/* 数据概览 */}
      {latestSnapshot && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`${styles.card} p-5`}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <span className={`text-sm ${styles.textSecondary}`}>粉丝数</span>
            </div>
            <div className="flex items-end gap-2">
              <span className={`text-2xl font-bold ${styles.textPrimary}`}>
                {Number(latestSnapshot.followers).toLocaleString()}
              </span>
              {followerDiff !== 0 && (
                <span className={`text-sm font-medium ${followerDiff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {followerDiff > 0 ? '+' : ''}{followerDiff}
                </span>
              )}
            </div>
          </div>

          <div className={`${styles.card} p-5`}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center">
                <Heart className="w-5 h-5 text-red-400" />
              </div>
              <span className={`text-sm ${styles.textSecondary}`}>总获赞</span>
            </div>
            <div className="flex items-end gap-2">
              <span className={`text-2xl font-bold ${styles.textPrimary}`}>
                {Number(latestSnapshot.likes).toLocaleString()}
              </span>
              {likeDiff !== 0 && (
                <span className={`text-sm font-medium ${likeDiff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {likeDiff > 0 ? '+' : ''}{likeDiff}
                </span>
              )}
            </div>
          </div>

          <div className={`${styles.card} p-5`}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
                <Video className="w-5 h-5 text-purple-400" />
              </div>
              <span className={`text-sm ${styles.textSecondary}`}>作品数</span>
            </div>
            <span className={`text-2xl font-bold ${styles.textPrimary}`}>
              {latestSnapshot.video_count}
            </span>
          </div>

          <div className={`${styles.card} p-5`}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <span className={`text-sm ${styles.textSecondary}`}>平均点赞</span>
            </div>
            <span className={`text-2xl font-bold ${styles.textPrimary}`}>
              {latestSnapshot.video_count > 0
                ? Math.round(Number(latestSnapshot.likes) / latestSnapshot.video_count).toLocaleString()
                : '-'}
            </span>
          </div>
        </div>
      )}

      {/* 账号信息 */}
      {latestSnapshot && (
        <div className={`${styles.card} p-5`}>
          <h3 className={`text-sm font-semibold ${styles.textPrimary} mb-3`}>账号信息</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className={styles.textMuted}>用户名</span>
              <p className={`font-medium ${styles.textPrimary}`}>{latestSnapshot.username || '-'}</p>
            </div>
            <div>
              <span className={styles.textMuted}>IP属地</span>
              <p className={`font-medium ${styles.textPrimary}`}>{latestSnapshot.ip_location || '-'}</p>
            </div>
            <div>
              <span className={styles.textMuted}>关注数</span>
              <p className={`font-medium ${styles.textPrimary}`}>{latestSnapshot.following_count || '-'}</p>
            </div>
            <div>
              <span className={styles.textMuted}>上次抓取</span>
              <p className={`font-medium ${styles.textPrimary}`}>
                {formatBeijingTime(latestSnapshot.scraped_at)}
              </p>
            </div>
          </div>
          {latestSnapshot.bio && (
            <div className="mt-3">
              <span className={`text-sm ${styles.textMuted}`}>简介</span>
              <p className={`text-sm mt-1 ${styles.textPrimary}`}>{latestSnapshot.bio}</p>
            </div>
          )}
          {currentAccount && (
            <div className="mt-3">
              <a
                href={currentAccount.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1`}
              >
                在抖音中查看 <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* 历史快照 */}
      {snapshots.length > 0 && (
        <div className={`${styles.card} overflow-hidden`}>
          <div className={`px-5 py-4 border-b ${styles.borderLight}`}>
            <h3 className={`text-sm font-semibold ${styles.textPrimary}`}>历史记录</h3>
          </div>
          <div className="divide-y divide-gray-700/30">
            {snapshots.map((snap) => (
              <div key={snap.id}>
                <div
                  className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => handleShowVideos(Number(snap.id))}
                >
                  <div className="flex items-center gap-6 text-sm">
                    <span className={styles.textMuted}>
                      {formatBeijingTime(snap.scraped_at)}
                    </span>
                    <span className={styles.textPrimary}>
                      粉丝: <strong>{Number(snap.followers).toLocaleString()}</strong>
                    </span>
                    <span className={styles.textPrimary}>
                      获赞: <strong>{Number(snap.likes).toLocaleString()}</strong>
                    </span>
                    <span className={styles.textPrimary}>
                      作品: <strong>{snap.video_count}</strong>
                    </span>
                  </div>
                  {expandedSnapshot === snap.id ? (
                    <ChevronUp className={`w-4 h-4 ${styles.textMuted}`} />
                  ) : (
                    <ChevronDown className={`w-4 h-4 ${styles.textMuted}`} />
                  )}
                </div>

                {expandedSnapshot === snap.id && videos.length > 0 && (
                  <div className={`px-5 pb-4 ${styles.bgTertiary}`}>
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className={styles.textMuted}>
                          <th className="text-left py-2 font-medium">标题</th>
                          <th className="text-right py-2 font-medium w-24">点赞</th>
                          <th className="text-center py-2 font-medium w-20">置顶</th>
                        </tr>
                      </thead>
                      <tbody>
                        {videos.map((video) => (
                          <tr key={video.id} className={`border-t ${styles.borderLight}`}>
                            <td className={`py-2 ${styles.textPrimary}`}>{video.title || '无标题'}</td>
                            <td className={`py-2 text-right ${styles.textPrimary}`}>
                              {Number(video.likes).toLocaleString()}
                            </td>
                            <td className="py-2 text-center">
                              {video.is_pinned ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">置顶</span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 添加账号弹窗 */}
      {showAddModal && (
        <div className={`fixed inset-0 ${styles.overlay} flex items-center justify-center z-50`}>
          <div className={`${styles.modal} p-6 w-full max-w-md mx-4`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className={`text-lg font-bold ${styles.textPrimary}`}>添加抖音账号</h2>
              <button onClick={() => setShowAddModal(false)}>
                <X className={`w-5 h-5 ${styles.textMuted}`} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>账号名称</label>
                <input
                  type="text"
                  value={newAccount.name}
                  onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm`}
                  placeholder="如：岱下纪事"
                />
              </div>
              <div>
                <label className={`block ${styles.textSecondary} text-sm font-medium mb-1.5`}>主页链接</label>
                <input
                  type="text"
                  value={newAccount.profileUrl}
                  onChange={e => setNewAccount({ ...newAccount, profileUrl: e.target.value })}
                  className={`w-full px-4 py-2.5 ${styles.input} text-sm`}
                  placeholder="https://www.douyin.com/user/..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className={`flex-1 px-4 py-2.5 ${styles.buttonSecondary} rounded-xl text-sm`}
                >
                  取消
                </button>
                <button
                  onClick={handleAddAccount}
                  className={`flex-1 px-4 py-2.5 ${styles.buttonPrimary} rounded-xl text-sm`}
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
