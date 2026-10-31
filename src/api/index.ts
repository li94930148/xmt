// 统一导出入口 - 保持向后兼容
export { login, mobileLogin, mobileRefresh, getMe, updateMyProfile, changePassword } from './auth';
export { getMobileDeviceId, registerMobileDevice, revokeMobileDevice } from './mobileDevices';
export { getTopics, getTopic, getTopicDeleteStatus, getTopicOutlineVersions, repairCurrentTopicStageRecord, createTopic, updateTopic, deleteTopic, auditTopic, updateTopicStatus } from './topics';
export type { GetTopicsParams } from './topics';
export { getHomeAttention, getHomeActivity } from './homeDashboard';
export type { HomeAttentionSummary, HomeAttentionTopic, HomePipelineTopic, HomeDraftTask, HomeTodayPublishingTask, HomeSyncAnomalyTask, HomeActivitySummary, HomeActivityEvent } from './homeDashboard';
export { TopicApiError } from './topics';
export { getUsers, getUser, getUserCreateRequestStatus, getUserDeleteRequestStatus, getUserUpdateRequestStatus, getAssignableRoles, createUser, updateUser, deleteUser, getLogs } from './users';
export { getMessages, getUnreadCount, getMessageReadStatus, markMessageAsRead, clearMessages, getMessageClearRequestStatus, getMessageReadAllRequestStatus, markAllAsRead } from './messages';
export { getTeamStats, getMonthlyStats, getUserStats, createAnalytics, getTopicAnalytics } from './analytics';
export { deleteResource, getCategories, getArchives, getArchiveDetail } from './resources';
export {
  getProduction, createProduction, getProductionCreateStatus, getProductionById, getProductionByIdForRecovery, updateProduction, deleteProduction, getProductionHistory,
  getComments, addComment, deleteComment, getShootingScriptVersions,
  getShooting, getShootingById, getShootingDeleteStatus, getShootingCompletionStatus, getShootingCreateStatus, deleteShooting, updateShooting, createShooting, syncShootingPublishedArchive,
  getPublishing, getPublishingById, getPublishingDeleteStatus, getPublishingCreateStatus, getPublishingUpdateStatus, createPublishing, updatePublishing, deletePublishing, syncPublishingPublishedArchive, getPublishingScriptVersions,
  reconcilePublishingDouyin, getPublishingDouyinCandidates, updatePublishingDouyinLink, getPublishingDouyinLinkState
} from './workflow';
export type { PublishedArchiveSyncState, PublishingDouyinCandidate, PublishingDouyinLinkState, WorkflowDocumentVersion } from './workflow';

// 新增 API 模块
export {
  getInspirations,
  createInspirition,
  voteInspiration,
  deleteInspiration,
  promoteInspiration,
  getInspirationDetail,
  createInspirationComment,
  getInspirationCreateRequest,
  getInspirationVoteRequest
} from './inspirations';
export type { Inspiration, InspirationComment } from './inspirations';
export { getTemplates, createTemplate, updateTemplate, deleteTemplate } from './templates';
export type { Template } from './templates';
export { getAchievements, getMyAchievements, checkAchievements, getAchievementProgress, getAchievementStats, getLeaderboard, getRecentAchievements, createAchievement, updateAchievement, deleteAchievement, seedAchievements } from './achievements';
export type { Achievement, AchievementStats, AchievementProgress, LeaderboardEntry, RecentAchievement } from './achievements';
export { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from './announcements';
export { submitAnonymousFeedback, getPublicAnonymousFeedback, getAnonymousFeedback, updateAnonymousFeedback, deleteAnonymousFeedback } from './anonymousFeedback';
export type { AnonymousFeedback, AnonymousFeedbackStatus, AnonymousFeedbackType, PublicAnonymousFeedback } from './anonymousFeedback';
export type { Announcement } from './announcements';
export { startPomodoro, completePomodoro, getPomodoroStats, getPomodoroRanking } from './pomodoro';
export type { PomodoroSession, PomodoroStats, PomodoroRanking } from './pomodoro';
export { getCalendarEvents, getCalendarEventCreateStatus, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from './calendar';
export type { CalendarEvent, CalendarEventCreatePayload } from './calendar';
export { exportTopics, exportAnalytics, getWeeklyReport } from './export';
export * from './retrospectives';
export { getActivityLogs } from './users';

// 权限管理
export {
  getRoles, getRole, createRole, updateRole, deleteRole,
  getUserRoles, assignUserRoles,
  getPermissions, getMyPermissions, createPermission, deletePermission
} from './permissions';
export { getPublicSystemSettings, getSystemSettings, updateSystemSettings } from './systemSettings';
export {
  getCollaborationTimeline,
  getCollaborationStats,
  getCollaborationReplay,
  getCollaborationExplanation,
  getCollaborationNarrative,
} from './collaborationDashboard';
export type {
  CollaborationTimelineEvent,
  CollaborationSnapshotSummary,
  CollaborationStats,
  UserContribution,
  CollaborationReplayResponse,
  CollaborationExplanation,
  CollaborationNarrativeItem,
} from './collaborationDashboard';
export {
  getContentEvolution,
  getContentImpact,
  getContentQuality,
} from './contentIntelligence';
export type {
  ContentEvolutionResponse,
  CollaborationImpactResponse,
  ContentQualityResponse,
} from './contentIntelligence';
export {
  getGeneratedSummary,
  getGeneratedTitle,
  getGeneratedStructure,
  getGeneratedSuggestions,
} from './contentGeneration';
export type {
  GeneratedSummaryResponse,
  GeneratedTitleResponse,
  GeneratedStructureResponse,
  GeneratedSuggestionsResponse,
} from './contentGeneration';
export {
  getContentOSContext,
  getContentOSInsight,
  getContentOSState,
} from './contentOrchestrator';
export {
  getDailyReportArchive,
  getMyDailyReport,
  getTeamDailyReports,
  reviewDailyReport,
  saveDailyReportDraft,
  submitDailyReport,
} from './dailyReports';
export type {
  DailyReport,
  DailyReportArchiveResponse,
  DailyReportItem,
  DailyReportRiskLevel,
  DailyReportStatus,
  GenerateDraftResponse,
  MyDailyReportResponse,
  SaveDailyReportDraftPayload,
  TeamDailyReportResponse,
} from './dailyReports';
