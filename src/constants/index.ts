/**
 * 统一常量模块 — 设计系统的核心
 * 所有页面共用的状态颜色、文本、工作流步骤等
 */

// === 选题状态颜色 ===
export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  pending:    { bg: 'bg-studio-amber/10',   text: 'text-studio-amber-contrast',   dot: 'bg-studio-amber',   border: 'border-studio-amber/30' },
  approved:   { bg: 'bg-studio-success/10', text: 'text-studio-success-contrast', dot: 'bg-studio-success', border: 'border-studio-success/30' },
  rejected:   { bg: 'bg-studio-coral/10',   text: 'text-studio-coral-contrast',   dot: 'bg-studio-coral',   border: 'border-studio-coral/30' },
  production: { bg: 'bg-studio-primary/10', text: 'text-studio-primary-contrast', dot: 'bg-studio-primary', border: 'border-studio-primary/30' },
  shooting:   { bg: 'bg-studio-violet/10',  text: 'text-studio-violet-contrast',  dot: 'bg-studio-violet',  border: 'border-studio-violet/30' },
  publishing: { bg: 'bg-studio-cyan/10',    text: 'text-studio-cyan-contrast',    dot: 'bg-studio-cyan',    border: 'border-studio-cyan/30' },
  completed:  { bg: 'bg-studio-surface-soft', text: 'text-studio-text-secondary', dot: 'bg-studio-text-muted', border: 'border-studio-border-soft' },
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
  success: { bg: 'bg-studio-success/10', border: 'border-studio-success/30', text: 'text-studio-success-contrast', icon: '✓' },
  error:   { bg: 'bg-studio-coral/10',   border: 'border-studio-coral/30',   text: 'text-studio-coral-contrast',   icon: '✕' },
  warning: { bg: 'bg-studio-amber/10',   border: 'border-studio-amber/30',   text: 'text-studio-amber-contrast',   icon: '!' },
  info:    { bg: 'bg-studio-primary/10', border: 'border-studio-primary/30', text: 'text-studio-primary-contrast', icon: 'i' },
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
  { value: 'common',    label: '普通', color: 'text-studio-text-secondary', bg: 'bg-studio-surface-soft', border: 'border-studio-border-soft' },
  { value: 'rare',      label: '稀有', color: 'text-studio-primary-contrast', bg: 'bg-studio-primary/10', border: 'border-studio-primary/30' },
  { value: 'epic',      label: '史诗', color: 'text-studio-violet-contrast',  bg: 'bg-studio-violet/10',  border: 'border-studio-violet/30' },
  { value: 'legendary', label: '传说', color: 'text-studio-amber-contrast',   bg: 'bg-studio-amber/10',   border: 'border-studio-amber/30' },
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
