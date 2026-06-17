/**
 * 共享类型定义 - 前后端共用
 * 所有实体模型、请求/响应 DTO、枚举类型统一定义在此
 */

// ==================== 基础枚举 ====================

export type TopicStatus = 'pending' | 'approved' | 'rejected' | 'production' | 'shooting' | 'publishing' | 'completed';

export type UserRole = string;

export type MessageType = 'info' | 'success' | 'warning' | 'error';

export type AnnouncementType = 'note' | 'announcement' | 'important';

export type ChangeType = 'minor' | 'major';

export type AuditAction = 'approved' | 'rejected';

// ==================== 用户相关 ====================

export interface User {
  id: number;
  username: string;
  password: string;
  email: string;
  role: UserRole;
  name: string;
  enabled: boolean;
  force_change_password?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

// ==================== 选题相关 ====================

export interface Topic {
  id: number;
  title: string;
  description: string;
  outline?: string;
  outline_json?: string;
  outline_markdown?: string;
  status: TopicStatus;
  platform: string;
  deadline: string;
  creator_id: number;
  assignee_id: number;
  creator_name?: string;
  assignee_name?: string;
  submitted_at?: string;
  created_at: string;
  updated_at: string;
  history?: TopicHistory[];
}

export interface TopicHistory {
  id: number;
  topic_id: number;
  action: string;
  comment: string;
  operator_id: number;
  operator_name?: string;
  created_at: string;
}

export interface CreateTopicRequest {
  title: string;
  description: string;
  platform: string;
  deadline: string;
}

export interface AuditTopicRequest {
  status: 'approved' | 'rejected';
  comment: string;
  assignee_id?: number;
}

export interface UpdateTopicRequest {
  title?: string;
  description?: string;
  platform?: string;
  deadline?: string;
  assignee_id?: number;
}

// ==================== 工作流相关 ====================

export interface Production {
  id: number;
  topic_id: number;
  version: string;
  content: string;
  content_json?: string;
  content_markdown?: string;
  status: string;
  file_path: string;
  operator_id: number;
  operator_name?: string;
  topic_title?: string;
  topic_status?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductionHistory {
  id: number;
  production_id: number;
  version: string;
  content: string;
  content_json?: string;
  content_markdown?: string;
  status: string;
  change_type: ChangeType;
  comment?: string;
  operator_id: number;
  operator_name?: string;
  created_at: string;
}

export interface Comment {
  id: number;
  target_type: string;
  target_id: number;
  content: string;
  operator_id: number;
  operator_name?: string;
  created_at: string;
}

export interface Shooting {
  id: number;
  topic_id: number;
  plan_date: string;
  location: string;
  equipment: string;
  script_content?: string | null;
  status: string;
  operator_id: number;
  operator_name?: string;
  topic_title?: string;
  topic_status?: string;
  production?: {
    id: number;
    version: string;
    content: string;
    content_markdown?: string;
    status: string;
    operator_name?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface Publishing {
  id: number;
  topic_id: number;
  platform: string;
  url: string;
  script_content?: string | null;
  status: string;
  publish_time: string;
  operator_id: number;
  operator_name?: string;
  topic_title?: string;
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  created_at: string;
  updated_at: string;
}

// ==================== 数据分析 ====================

export interface Analytics {
  id: number;
  topic_id: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  data_date: string;
  created_at: string;
}

export interface TeamStats {
  month: number;
  year: number;
  completed_count: number;
  total_count: number;
  overdue_count: number;
  completion_rate: string;
  overdue_rate: string;
  avg_days: string;
}

export interface MonthlyStats {
  month: number;
  year: number;
  total_views: number;
  total_likes: number;
  total_shares: number;
  total_comments: number;
  topic_count: number;
}

export interface UserStats {
  user_id: number;
  user_name: string;
  topic_count: number;
  total_views: number;
  total_likes: number;
}

// ==================== 消息与活动 ====================

export interface Message {
  id: number;
  user_id: number;
  title: string;
  content: string;
  type: MessageType;
  read: boolean;
  link?: string;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  action: string;
  target: string;
  detail: string;
  user_name?: string;
  created_at: string;
}

// ==================== 资源管理 ====================

export interface Resource {
  id: number;
  name: string;
  type: string;
  file_path: string;
  category: string;
  content: string;
  uploader_id: number;
  uploader_name?: string;
  created_at: string;
  updated_at: string;
}

// ==================== 灵感池 ====================

export interface Inspiration {
  id: number;
  title: string;
  description?: string;
  category?: string;
  votes: number;
  voted: boolean;
  comment_count?: number;
  creator_id: number;
  creator_name?: string;
  topic_id?: number;
  status?: string;
  created_at: string;
  updated_at: string;
}

export interface InspirationComment {
  id: number;
  inspiration_id: number;
  content: string;
  creator_id: number;
  creator_name?: string;
  created_at: string;
}

// ==================== 模板 ====================

export interface TopicTemplate {
  id: number;
  name: string;
  platform?: string;
  description?: string;
  template_data: string;
  creator_id: number;
  creator_name?: string;
  is_default?: boolean;
  created_at: string;
  updated_at: string;
}

export type Template = TopicTemplate;

// ==================== 成就系统 ====================

export interface Achievement {
  id: number;
  name: string;
  description: string;
  icon: string;
  condition_type: string;
  condition_value: number;
  points: number;
  category: string;
  rarity: string;
  sort_order: number;
  earned?: number;
  earned_at?: string;
  created_at: string;
}

export interface AchievementStats {
  total: number;
  earned: number;
  totalPoints: number;
  byCategory: { category: string; total: number; earned: number }[];
  byRarity: { rarity: string; total: number; earned: number }[];
}

export interface AchievementProgress {
  current: number;
  target: number;
  percentage: number;
}

export interface LeaderboardEntry {
  user_id: number;
  user_name: string;
  avatar: string | null;
  achievement_count: number;
  total_points: number;
}

export interface RecentAchievement {
  id: number;
  user_id: number;
  user_name: string;
  achievement_name: string;
  icon: string;
  points: number;
  rarity: string;
  earned_at: string;
}

// ==================== 公告 ====================

export interface Announcement {
  id: number;
  content: string;
  type: AnnouncementType | string;
  pinned: boolean;
  creator_id: number;
  creator_name?: string;
  created_at: string;
  updated_at: string;
}

// ==================== 番茄钟 ====================

export interface PomodoroSession {
  id: number;
  user_id: number;
  topic_id?: number;
  topic_title?: string;
  duration: number;
  status?: 'active' | 'completed' | 'cancelled';
  completed?: boolean;
  started_at: string;
  completed_at?: string;
  ended_at?: string;
}

export interface PomodoroStats {
  total_sessions: number;
  total_minutes: number;
  today_sessions: number;
  today_minutes: number;
  streak: number;
}

export interface PomodoroRanking {
  user_id: number;
  user_name: string;
  total_sessions: number;
  total_minutes: number;
}

// ==================== 日历 ====================

export interface CalendarEvent {
  id: number;
  title: string;
  description?: string;
  event_date: string;
  event_type?: string;
  topic_id?: number;
  topic_title?: string;
  creator_id: number;
  creator_name?: string;
  source_type?: string;
  status?: string;
  created_at: string;
  updated_at?: string;
}

// ==================== 抖音数据 ====================

export interface DouyinAccount {
  id: number;
  name: string;
  profile_url: string;
  douyin_id?: string;
  created_at: string;
}

export interface DouyinSnapshot {
  id: number;
  account_id: number;
  username: string;
  followers: number;
  likes: number;
  following_count: number;
  ip_location: string;
  bio: string;
  video_count: number;
  raw_data?: string;
  scraped_at: string;
}

export interface DouyinVideo {
  id: number;
  snapshot_id: number;
  title: string;
  likes: number;
  comments: number;
  shares: number;
  is_pinned: number;
}

// ==================== 备份 ====================

export interface BackupFile {
  name: string;
  size: number;
  created: string;
}

// ==================== JWT ====================

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
}
