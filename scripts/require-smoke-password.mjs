export function requireSmokePassword(environment = process.env) {
  const password = environment.SMOKE_PASSWORD;
  if (typeof password !== 'string' || password.trim().length === 0) {
    throw new Error('缺少必需的环境变量 SMOKE_PASSWORD。请先设置测试账号密码，再运行此 smoke/verify 脚本。');
  }
  return password;
}

export function getSmokePasswordForLogin(environment = process.env) {
  return environment.TOKEN ? '' : requireSmokePassword(environment);
}
