const path = require('path');

const rootDir = __dirname;

module.exports = {
  apps: [{
    name: 'xmt-server',
    script: 'api/server.ts',
    interpreter: 'node',
    node_args: '--import tsx --import dotenv/config',
    cwd: rootDir,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    // 日志
    error_file: path.join(rootDir, 'logs', 'error.log'),
    out_file: path.join(rootDir, 'logs', 'out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }]
};
