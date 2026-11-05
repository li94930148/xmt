import type { Client } from '@libsql/client';

const ACHIEVEMENT_COLUMN_DEFINITIONS = [
  { name: 'points', definition: 'INTEGER DEFAULT 10' },
  { name: 'category', definition: "TEXT DEFAULT 'milestone'" },
  { name: 'rarity', definition: "TEXT DEFAULT 'common'" },
  { name: 'sort_order', definition: 'INTEGER DEFAULT 0' },
] as const;

export async function ensureAchievementSchemaColumns(client: Pick<Client, 'execute'>): Promise<void> {
  const schema = await client.execute('PRAGMA table_info(achievements)');
  const existingColumns = new Set(
    schema.rows.map((row) => String(row.name).toLowerCase()),
  );

  for (const column of ACHIEVEMENT_COLUMN_DEFINITIONS) {
    const normalizedName = column.name.toLowerCase();
    if (existingColumns.has(normalizedName)) continue;

    await client.execute(
      `ALTER TABLE achievements ADD COLUMN ${column.name} ${column.definition}`,
    );
    existingColumns.add(normalizedName);
  }
}
