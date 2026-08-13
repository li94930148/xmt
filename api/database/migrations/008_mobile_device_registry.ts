import type { DatabaseMigration } from './types';

export const mobileDeviceRegistryMigration: DatabaseMigration = {
  version: '008',
  name: 'mobile_device_registry',
  checksum: '008-mobile-device-registry-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS mobile_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('android')),
        device_id TEXT NOT NULL,
        push_token TEXT,
        app_version TEXT,
        last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME,
        UNIQUE(user_id, platform, device_id)
      )
    `);
    await executor.execute('CREATE INDEX IF NOT EXISTS idx_mobile_devices_active ON mobile_devices(user_id, platform, revoked_at)');
  },
};
