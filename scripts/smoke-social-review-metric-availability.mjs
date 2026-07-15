import 'dotenv/config';
import { queryOne } from '../api/database/utils.ts';
const row = await queryOne(`SELECT COUNT(*) AS total, SUM(CASE WHEN views > 0 THEN 1 ELSE 0 END) AS views, SUM(CASE WHEN likes IS NULL AND comments IS NULL AND shares IS NULL AND collects IS NULL THEN 1 ELSE 0 END) AS missing FROM social_videos WHERE account_id = 2`);
if (!Number(row?.total) || !Number(row?.views) || !Number(row?.missing)) throw new Error('指标可用性验证失败。');
console.log(`作品数量：${row.total}`); console.log(`播放正常：${row.views}`); console.log(`互动缺失：${row.missing}`);
