import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { execute, queryOne } from '../database/utils';

const router = Router();

type LoginLayoutMode = 'style1' | 'style2' | 'style3';

type ManagedSystemSettings = {
  system: {
    name: string;
    browserTitle: string;
    description: string;
    icon: string;
  };
  branding: {
    brandName: string;
    logo: string;
    brandDescription: string;
  };
  login: {
    layout: LoginLayoutMode;
    welcomeTitle: string;
    welcomeMessage: string;
  };
};

const SETTINGS_META_KEY = 'system_settings';

const defaultSettings: ManagedSystemSettings = {
  system: {
    name: '新媒体协作管理系统',
    browserTitle: '新媒体协作管理系统',
    description: '统一管理选题、创作、拍摄、发布与复盘流程。',
    icon: '新',
  },
  branding: {
    brandName: '新媒体协作管理系统',
    logo: '',
    brandDescription: '让团队在同一套流程里协作、追踪和复盘内容生产。',
  },
  login: {
    layout: 'style1',
    welcomeTitle: '欢迎回来',
    welcomeMessage: '请输入账号密码登录系统',
  },
};

function sanitizeString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeSettings(input: unknown): ManagedSystemSettings {
  const source = (input && typeof input === 'object' ? input : {}) as Partial<ManagedSystemSettings>;
  const system = (source.system && typeof source.system === 'object'
    ? source.system
    : {}) as Partial<ManagedSystemSettings['system']>;
  const branding = (source.branding && typeof source.branding === 'object'
    ? source.branding
    : {}) as Partial<ManagedSystemSettings['branding']>;
  const login = (source.login && typeof source.login === 'object'
    ? source.login
    : {}) as Partial<ManagedSystemSettings['login']>;
  const layout = login.layout === 'style2' || login.layout === 'style3' ? login.layout : 'style1';

  return {
    system: {
      name: sanitizeString(system.name, defaultSettings.system.name),
      browserTitle: sanitizeString(system.browserTitle, defaultSettings.system.browserTitle),
      description: sanitizeString(system.description, defaultSettings.system.description),
      icon: sanitizeString(system.icon, defaultSettings.system.icon),
    },
    branding: {
      brandName: sanitizeString(branding.brandName, defaultSettings.branding.brandName),
      logo: typeof branding.logo === 'string' ? branding.logo : defaultSettings.branding.logo,
      brandDescription: sanitizeString(
        branding.brandDescription,
        defaultSettings.branding.brandDescription,
      ),
    },
    login: {
      layout,
      welcomeTitle: sanitizeString(login.welcomeTitle, defaultSettings.login.welcomeTitle),
      welcomeMessage: sanitizeString(login.welcomeMessage, defaultSettings.login.welcomeMessage),
    },
  };
}

async function loadSettings() {
  const record = await queryOne<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = ?`,
    [SETTINGS_META_KEY],
  );

  if (!record?.value) {
    return defaultSettings;
  }

  try {
    return normalizeSettings(JSON.parse(record.value));
  } catch {
    return defaultSettings;
  }
}

async function saveSettings(settings: ManagedSystemSettings) {
  await execute(
    `INSERT INTO app_meta (key, value, created_at)
     VALUES (?, ?, datetime('now', '+8 hours'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       created_at = datetime('now', '+8 hours')`,
    [SETTINGS_META_KEY, JSON.stringify(settings)],
  );
}

router.get('/public', async (_req, res) => {
  try {
    res.json(await loadSettings());
  } catch (error) {
    res.status(500).json({ message: '获取公开系统设置失败', error });
  }
});

router.get('/', authenticate, requirePermission('system:settings'), async (_req, res) => {
  try {
    res.json(await loadSettings());
  } catch (error) {
    res.status(500).json({ message: '获取系统设置失败', error });
  }
});

router.put('/', authenticate, requirePermission('system:settings'), async (req, res) => {
  try {
    const current = await loadSettings();
    const next = normalizeSettings({
      system: { ...current.system, ...(req.body?.system ?? {}) },
      branding: { ...current.branding, ...(req.body?.branding ?? {}) },
      login: { ...current.login, ...(req.body?.login ?? {}) },
    });

    await saveSettings(next);
    res.json(next);
  } catch (error) {
    res.status(500).json({ message: '保存系统设置失败', error });
  }
});

export default router;
