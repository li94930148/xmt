-- XMT v2.10.2-sync - 服务端同步契约兼容层
-- 仅包含可向后兼容的新增列和条件唯一索引；部署前应先备份数据库。
ALTER TABLE douyin_works ADD COLUMN content_id INTEGER;

ALTER TABLE douyin_sync_logs ADD COLUMN contract_version TEXT;
ALTER TABLE douyin_sync_logs ADD COLUMN collection_mode TEXT;
ALTER TABLE douyin_sync_logs ADD COLUMN snapshot_id TEXT;
ALTER TABLE douyin_sync_logs ADD COLUMN summary_json TEXT NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS idx_douyin_works_content
ON douyin_works(content_id)
WHERE content_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_douyin_sync_logs_snapshot
ON douyin_sync_logs(account_id, snapshot_id)
WHERE snapshot_id IS NOT NULL;

-- 污染候选只读报告：本阶段禁止删除，实际清理推迟到 Phase 5。
SELECT id, account_id, platform, platform_item_id, title, created_at
FROM creator_content_items
WHERE lower(trim(title)) IN ('react', 'flash_mod_modal', 'start_flash_mod')
ORDER BY account_id, id;
