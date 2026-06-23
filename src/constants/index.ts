/**
 * 统一常量模块 — 设计系统的核心
 * 所有页面共用的状态颜色、文本、工作流步骤等
 */

// === 选题状态颜色 ===
export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  pending:    { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  dot: 'bg-yellow-500',  border: 'border-yellow-500/30' },
  approved:   { bg: 'bg-green-500/10',   text: 'text-green-400',   dot: 'bg-green-500',   border: 'border-green-500/30' },
  rejected:   { bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-500',     border: 'border-red-500/30' },
  production: { bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-500',    border: 'border-blue-500/30' },
  shooting:   { bg: 'bg-purple-500/10',  text: 'text-purple-400',  dot: 'bg-purple-500',  border: 'border-purple-500/30' },
  publishing: { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  dot: 'bg-indigo-500',  border: 'border-indigo-500/30' },
  completed:  { bg: 'bg-gray-500/10',    text: 'text-gray-400',    dot: 'bg-gray-500',    border: 'border-gray-500/30' },
};

// === 选题状态中文 ===
export const STATUS_TEXT: Record<string, string> = {
  pending:    '待审核',
  approved:   '已通过',
  rejected:   '已驳回',
  production: '创作中',
  shooting:   '拍摄中',
  publishing: '发布中',
  completed:  '已完成',
};

// === 工作流步骤 ===
export const WORKFLOW_STEPS = [
  { status: 'pending',    label: '待审核',  color: 'bg-yellow-500' },
  { status: 'approved',   label: '已通过',  color: 'bg-green-500' },
  { status: 'production', label: '创作中',  color: 'bg-blue-500' },
  { status: 'shooting',   label: '成片制作', color: 'bg-purple-500' },
  { status: 'publishing', label: '发布中',  color: 'bg-indigo-500' },
  { status: 'completed',  label: '已完成',  color: 'bg-gray-500' },
];

// === 平台选项 ===
export const PLATFORMS = [
  { value: 'douyin',   label: '抖音' },
  { value: 'kuaishou', label: '快手' },
  { value: 'bilibili', label: 'B站' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'weixin',   label: '微信视频号' },
  { value: 'other',    label: '其他' },
];

// === 通知类型样式 ===
export const NOTIFICATION_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  icon: '✓' },
  error:   { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    icon: '✕' },
  warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: '!' },
  info:    { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   icon: 'i' },
};

// === 成就相关 ===
export const ACHIEVEMENT_CATEGORIES = [
  { value: 'production', label: '创作达人', icon: '🎬' },
  { value: 'efficiency', label: '效率之星', icon: '⚡' },
  { value: 'social',     label: '社交达人', icon: '🤝' },
  { value: 'milestone',  label: '里程碑',  icon: '🏆' },
  { value: 'special',    label: '特殊成就', icon: '⭐' },
];

export const ACHIEVEMENT_RARITIES = [
  { value: 'common',    label: '普通', color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/30' },
  { value: 'rare',      label: '稀有', color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  { value: 'epic',      label: '史诗', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  { value: 'legendary', label: '传说', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
];

// === 成就等级阈值 ===
export const ACHIEVEMENT_LEVELS = [
  { level: 1, name: '新手',    minPoints: 0,    icon: '🌱' },
  { level: 2, name: '见习',    minPoints: 50,   icon: '🌿' },
  { level: 3, name: '熟练',    minPoints: 150,  icon: '🌳' },
  { level: 4, name: '专家',    minPoints: 300,  icon: '⭐' },
  { level: 5, name: '大师',    minPoints: 500,  icon: '🏅' },
  { level: 6, name: '传奇',    minPoints: 800,  icon: '👑' },
  { level: 7, name: '传说',    minPoints: 1200, icon: '💎' },
];

// === 角色映射 ===
export const ROLE_MAP: Record<string, string> = {
  admin:    '管理员',
  director: '编导',
  editor:   '编辑',
  member:   '成员',
};

// === 成就条件类型 ===
export const ACHIEVEMENT_CONDITION_TYPES = [
  { value: 'topic_count',        label: '创建选题数量' },
  { value: 'completed_topics',   label: '完成选题数量' },
  { value: 'pomodoro_count',     label: '完成番茄钟数量' },
  { value: 'pomodoro_hours',     label: '番茄钟总时长(分钟)' },
  { value: 'inspiration_count',  label: '创建灵感数量' },
  { value: 'login_streak',       label: '连续登录天数' },
  { value: 'publish_count',      label: '发布内容数量' },
  { value: 'total_views',        label: '总播放量' },
  { value: 'total_likes',        label: '总点赞量' },
];
