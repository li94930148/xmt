import type { Client, Transaction } from '@libsql/client';
import { decryptLegacyTokenWithKey, decryptTokenWithKey, encryptTokenWithKey } from './token-crypto.js';

type TokenRow = {
  id: unknown;
  access_token_encrypt: unknown;
  refresh_token_encrypt: unknown;
};

type TokenColumn = 'access_token_encrypt' | 'refresh_token_encrypt';

export type DouyinTokenMigrationResult = {
  table: 'present' | 'absent';
  accounts: number;
  encryptedTokens: number;
  alreadyEncrypted: number;
  action: 'dry_run' | 'migrated';
};

function tokenColumns(value: TokenRow): Array<{ column: TokenColumn; ciphertext: string }> {
  const fields: TokenColumn[] = ['access_token_encrypt', 'refresh_token_encrypt'];
  return fields.flatMap((column) => {
    const valueForColumn = value[column];
    return typeof valueForColumn === 'string' && valueForColumn.length > 0
      ? [{ column, ciphertext: valueForColumn }]
      : [];
  });
}

async function tableExists(executor: Client | Transaction): Promise<boolean> {
  const result = await executor.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type='table' AND name='douyin_accounts'",
    args: [],
  });
  return result.rows.length > 0;
}

async function assertTokenColumns(executor: Client | Transaction): Promise<void> {
  const result = await executor.execute('PRAGMA table_info(douyin_accounts)');
  const columns = new Set(result.rows.map((row) => String(row.name)));
  for (const name of ['access_token_encrypt', 'refresh_token_encrypt']) {
    if (!columns.has(name)) {
      throw new Error(`douyin_accounts is missing expected token column: ${name}`);
    }
  }
}

function migrateRowTokens(row: TokenRow, oldKey: Buffer, newKey: Buffer) {
  const assignments: Partial<Record<TokenColumn, string>> = {};
  let migrated = 0;
  let alreadyEncrypted = 0;

  for (const { column, ciphertext } of tokenColumns(row)) {
    if (ciphertext.startsWith('v1.')) {
      decryptTokenWithKey(ciphertext, newKey);
      alreadyEncrypted += 1;
      continue;
    }

    const plaintext = decryptLegacyTokenWithKey(ciphertext, oldKey);
    const replacement = encryptTokenWithKey(plaintext, newKey);
    if (decryptTokenWithKey(replacement, newKey) !== plaintext) {
      throw new Error('Douyin token encryption verification failed; transaction was rolled back.');
    }
    assignments[column] = replacement;
    migrated += 1;
  }

  return { assignments, migrated, alreadyEncrypted };
}

export async function migrateDouyinAccountTokens(
  client: Client,
  oldKey: Buffer,
  newKey: Buffer,
  apply = false,
): Promise<DouyinTokenMigrationResult> {
  const transaction = apply ? await client.transaction('write') : null;
  const executor = transaction ?? client;

  try {
    if (!(await tableExists(executor))) {
      if (transaction) await transaction.commit();
      return { table: 'absent', accounts: 0, encryptedTokens: 0, alreadyEncrypted: 0, action: apply ? 'migrated' : 'dry_run' };
    }

    await assertTokenColumns(executor);
    const result = await executor.execute({
      sql: `SELECT id, access_token_encrypt, refresh_token_encrypt
            FROM douyin_accounts
            WHERE access_token_encrypt IS NOT NULL OR refresh_token_encrypt IS NOT NULL
            ORDER BY id`,
      args: [],
    });
    let encryptedTokens = 0;
    let alreadyEncrypted = 0;

    for (const rawRow of result.rows) {
      const row = rawRow as unknown as TokenRow;
      const update = migrateRowTokens(row, oldKey, newKey);
      encryptedTokens += update.migrated;
      alreadyEncrypted += update.alreadyEncrypted;
      const assignments = Object.entries(update.assignments) as Array<[TokenColumn, string]>;

      if (transaction && assignments.length > 0) {
        const sqlAssignments = assignments.map(([column]) => `${column} = ?`).join(', ');
        const values = assignments.map(([, value]) => value);
        const updated = await transaction.execute({
          sql: `UPDATE douyin_accounts SET ${sqlAssignments} WHERE id = ?`,
          args: [...values, Number(row.id)],
        });
        if (updated.rowsAffected !== 1) {
          throw new Error('Douyin token migration could not update one account row; transaction was rolled back.');
        }
      }
    }

    if (transaction) await transaction.commit();
    return {
      table: 'present',
      accounts: result.rows.length,
      encryptedTokens,
      alreadyEncrypted,
      action: apply ? 'migrated' : 'dry_run',
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  } finally {
    transaction?.close();
  }
}
