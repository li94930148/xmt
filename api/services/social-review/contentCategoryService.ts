import { execute, queryOne } from '../../database/utils.js';

const CATEGORY_RULES: Array<[string, string[]]> = [
  ['城市宣传', ['城市', '家乡', '文旅', '宣传']],
  ['旅游', ['旅游', '景点', '攻略', '出游', '旅行']],
  ['历史文化', ['历史', '文化', '古城', '博物馆', '非遗']],
  ['知识', ['知识', '科普', '课堂', '技巧', '教程']],
  ['人物', ['人物', '访谈', '故事', '老师', '人物']],
  ['活动', ['活动', '节庆', '展会', '赛事', '发布会']],
  ['商业', ['商业', '招商', '品牌', '产品', '门店']],
];

function categoryForTitle(title: string) {
  const matched = CATEGORY_RULES.find(([, keywords]) => keywords.some((keyword) => title.includes(keyword)));
  return matched?.[0] || '其他';
}

export async function syncVideoContentCategory(videoId: number, title: string) {
  const categoryName = categoryForTitle(title);
  await execute(`INSERT INTO content_categories (name) VALUES (?) ON CONFLICT(name) DO NOTHING`, [categoryName]);
  const category = await queryOne<Record<string, unknown>>(`SELECT id FROM content_categories WHERE name = ?`, [categoryName]);
  if (!category?.id) return null;
  await execute(`INSERT INTO video_category_relations (video_id, category_id, source) VALUES (?, ?, 'rule') ON CONFLICT(video_id, category_id) DO UPDATE SET source = 'rule'`, [videoId, Number(category.id)]);
  return categoryName;
}
