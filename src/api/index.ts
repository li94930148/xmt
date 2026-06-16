// 统一导出入口 - 保持向后兼容
export { login, getMe, changePassword } from './auth';
export { getTopics, getTopic, createTopic, updateTopic, deleteTopic, auditTopic, updateTopicStatus } from './topics';
export { getUsers, createUser, updateUser, deleteUser, getLogs } from './users';
export { getMessages, getUnreadCount, markMessageAsRead, clearMessages, markAllAsRead } from './messages';
export { getTeamStats, getMonthlyStats, getUserStats, createAnalytics, getTopicAnalytics } from './analytics';
export { getResources, createResource, updateResource, deleteResource, getCategories, getArchives, getArchiveDetail } from './resources';
export {
  getProduction, createProduction, getProductionById, updateProduction, deleteProduction, getProductionHistory,
  getComments, addComment, deleteComment,
  getShooting, getShootingById, updateShooting, createShooting,
  getPublishing, getPublishingById, createPublishing, updatePublishing, deletePublishing
} from './workflow';

// 新增 API 模块
export {
  getInspirations,
  createInspirition,
  voteInspiration,
  deleteInspiration,
  promoteInspiration,
  getInspirationDetail,
  createInspirationComment
} from './inspirations';
export type { Inspiration, InspirationComment } from './inspirations';
export { getTemplates, createTemplate, updateTemplate, deleteTemplate } from './templates';
export type { Template } from './templates';
export { getAchievements, getMyAchievements, checkAchievements, getAchievementProgress, getAchievementStats, getLeaderboard, getRecentAchievements, createAchievement, updateAchievement, deleteAchievement, seedAchievements } from './achievements';
export type { Achievement, AchievementStats, AchievementProgress, LeaderboardEntry, RecentAchievement } from './achievements';
export { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from './announcements';
export type { Announcement } from './announcements';
export { startPomodoro, completePomodoro, getPomodoroStats, getPomodoroRanking } from './pomodoro';
export type { PomodoroSession, PomodoroStats, PomodoroRanking } from './pomodoro';
export { getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from './calendar';
export type { CalendarEvent } from './calendar';
export { exportTopics, exportAnalytics, getWeeklyReport } from './export';
export { getActivityLogs } from './users';

// 抖音数据
export {
  getDouyinAccounts, addDouyinAccount, deleteDouyinAccount,
  scrapeDouyin, getDouyinSnapshots, getDouyinVideos, getDouyinTrend
} from './douyin';
export type { DouyinAccount, DouyinSnapshot, DouyinVideo } from './douyin';

// 权限管理
export {
  getRoles, getRole, createRole, updateRole, deleteRole,
  getUserRoles, assignUserRoles,
  getPermissions, getMyPermissions, createPermission, deletePermission
} from './permissions';
export { getPublicSystemSettings, getSystemSettings, updateSystemSettings } from './systemSettings';
