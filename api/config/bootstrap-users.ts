import { randomBytes } from 'node:crypto';

export type BootstrapUser = {
  username: string;
  password: string;
  email: string;
  role: 'admin' | 'director' | 'member';
  name: string;
};

export type BootstrapUserPlan = {
  mode: 'development' | 'production' | 'production-skipped';
  users: BootstrapUser[];
};

const DEFAULT_BOOTSTRAP_USERS = [
  { username: 'admin', email: 'admin@local.dev', role: 'admin', name: '管理员' },
  { username: 'director', email: 'director@local.dev', role: 'director', name: '编导' },
  { username: 'member1', email: 'member1@local.dev', role: 'member', name: '员工张三' },
  { username: 'member2', email: 'member2@local.dev', role: 'member', name: '员工李四' },
] satisfies Array<Omit<BootstrapUser, 'password'>>;

export function createBootstrapUserPlan(
  environment: NodeJS.ProcessEnv = process.env,
  generatePassword: () => string = () => randomBytes(32).toString('base64url'),
): BootstrapUserPlan {
  const isProduction = environment.NODE_ENV === 'production';
  if (isProduction && environment.XMT_BOOTSTRAP_SEED_USERS !== 'true') {
    return { mode: 'production-skipped', users: [] };
  }

  const users = DEFAULT_BOOTSTRAP_USERS.map((user) => ({
    ...user,
    password: generatePassword(),
  }));
  return { mode: isProduction ? 'production' : 'development', users };
}
