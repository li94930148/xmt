export type LoginLayoutMode = 'style1' | 'style2' | 'style3';

export type ManagedSystemSettings = {
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

export const defaultSystemSettings: ManagedSystemSettings = {
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

export function normalizeSystemSettings(input: unknown): ManagedSystemSettings {
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
      name: sanitizeString(system.name, defaultSystemSettings.system.name),
      browserTitle: sanitizeString(system.browserTitle, defaultSystemSettings.system.browserTitle),
      description: sanitizeString(system.description, defaultSystemSettings.system.description),
      icon: sanitizeString(system.icon, defaultSystemSettings.system.icon),
    },
    branding: {
      brandName: sanitizeString(branding.brandName, defaultSystemSettings.branding.brandName),
      logo: typeof branding.logo === 'string' ? branding.logo : defaultSystemSettings.branding.logo,
      brandDescription: sanitizeString(
        branding.brandDescription,
        defaultSystemSettings.branding.brandDescription,
      ),
    },
    login: {
      layout,
      welcomeTitle: sanitizeString(login.welcomeTitle, defaultSystemSettings.login.welcomeTitle),
      welcomeMessage: sanitizeString(login.welcomeMessage, defaultSystemSettings.login.welcomeMessage),
    },
  };
}

export function mergeSystemSettings(
  current: ManagedSystemSettings,
  patch: Partial<ManagedSystemSettings>,
) {
  return normalizeSystemSettings({
    system: { ...current.system, ...patch.system },
    branding: { ...current.branding, ...patch.branding },
    login: { ...current.login, ...patch.login },
  });
}

export function applyDocumentBranding(settings: ManagedSystemSettings) {
  if (typeof document === 'undefined') {
    return;
  }

  document.title = settings.system.browserTitle || settings.system.name;

  const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
  if (!link) {
    return;
  }

  if (settings.branding.logo) {
    link.href = settings.branding.logo;
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  ctx.font = '56px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(settings.system.icon || settings.system.name.slice(0, 1), 32, 36);
  link.href = canvas.toDataURL();
}

export function emitSystemSettingsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('xmt-settings-changed'));
  }
}
