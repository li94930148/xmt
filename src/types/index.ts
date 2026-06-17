/**
 * 前端类型入口 - 统一从 shared/types 导出
 * 向后兼容：所有现有的 import { Xxx } from '../types' 仍然有效
 */
export type {
  // 基础枚举
  TopicStatus,
  UserRole,
  MessageType,
  AnnouncementType,
  ChangeType,
  AuditAction,
  // 用户
  User,
  LoginRequest,
  // 选题
  Topic,
  TopicHistory,
  CreateTopicRequest,
  AuditTopicRequest,
  UpdateTopicRequest,
  // 工作流
  Production,
  ProductionHistory,
  Comment,
  Shooting,
  Publishing,
  // 数据分析
  Analytics,
  TeamStats,
  MonthlyStats,
  UserStats,
  // 消息与活动
  Message,
  ActivityLog,
  // 资源
  Resource,
  // 灵感池
  Inspiration,
  // 模板
  TopicTemplate,
  Template,
  // 成就系统
  Achievement,
  AchievementStats,
  AchievementProgress,
  LeaderboardEntry,
  RecentAchievement,
  // 公告
  Announcement,
  // 番茄钟
  PomodoroSession,
  PomodoroStats,
  PomodoroRanking,
  // 日历
  CalendarEvent,
  // 抖音
  DouyinAccount,
  DouyinSnapshot,
  DouyinVideo,
  // 备份
  BackupFile,
  // JWT
  JwtPayload,
} from '@shared/types';
