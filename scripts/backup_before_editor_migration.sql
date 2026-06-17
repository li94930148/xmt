-- ============================================================
-- 数据库备份脚本 - 编辑器迁移前执行
-- 日期: 2026-06-05
-- 用途: 备份 production, production_history, topics 表
-- ============================================================

-- 1. 创建备份表（结构+数据）
CREATE TABLE IF NOT EXISTS production_backup_20260605 AS SELECT * FROM production;
CREATE TABLE IF NOT EXISTS production_history_backup_20260605 AS SELECT * FROM production_history;
CREATE TABLE IF NOT EXISTS topics_backup_20260605 AS SELECT * FROM topics;

-- 2. 验证备份数据量
SELECT 'production' as tbl, COUNT(*) as cnt FROM production
UNION ALL
SELECT 'production_backup', COUNT(*) FROM production_backup_20260605
UNION ALL
SELECT 'production_history', COUNT(*) FROM production_history
UNION ALL
SELECT 'production_history_backup', COUNT(*) FROM production_history_backup_20260605
UNION ALL
SELECT 'topics', COUNT(*) FROM topics
UNION ALL
SELECT 'topics_backup', COUNT(*) FROM topics_backup_20260605;

-- 3. 如果需要回滚，执行以下语句:
-- DROP TABLE IF EXISTS production;
-- ALTER TABLE production_backup_20260605 RENAME TO production;
-- DROP TABLE IF EXISTS production_history;
-- ALTER TABLE production_history_backup_20260605 RENAME TO production_history;
-- DROP TABLE IF EXISTS topics;
-- ALTER TABLE topics_backup_20260605 RENAME TO topics;
