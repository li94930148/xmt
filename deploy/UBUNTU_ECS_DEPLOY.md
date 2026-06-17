# XMT 部署到阿里云 Ubuntu 22.04 ECS


npm run build

 pm2 restart xmt-server

适用环境：

- Ubuntu 22.04 64 位
- 2 vCPU / 4 GiB RAM / 40 GiB ESSD
- Node.js 24 LTS
- systemd 管理 Node 服务
- Caddy 提供反向代理和 HTTPS
- SQLite 本地持久化，每日一致性备份

文中的 `<ECS公网IP>`、`app.example.com` 和用户 IP 都必须替换成真实值。

## 1. 配置阿里云安全组

入方向仅保留：

| 协议/端口 | 来源 | 用途 |
| --- | --- | --- |
| TCP 22 | 管理员公网 IP `/32` | SSH |
| TCP 80 | `0.0.0.0/0` | HTTP、证书验证 |
| TCP 443 | `0.0.0.0/0` | HTTPS |

删除公网开放的 `3389`、`3001` 和多余的 `22` 规则。IPv6 不使用时不添加
IPv6 入方向规则。

## 2. 首次 SSH 登录

在本地 Windows PowerShell 中：

```powershell
ssh root@<ECS公网IP>
```

首次连接输入 `yes`，然后输入 ECS root 密码。建议随后在阿里云控制台重置成
高强度密码，并最终改用 SSH 密钥。

## 3. 更新系统并设置时区

在 ECS 中执行：

```bash
apt update
DEBIAN_FRONTEND=noninteractive apt upgrade -y
timedatectl set-timezone Asia/Shanghai
hostnamectl set-hostname xmt-server
reboot
```

等待约一分钟后重新 SSH 登录。

## 4. 配置 Ubuntu 防火墙

必须先允许 SSH，再启用 UFW：

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose
```

不要执行 `ufw allow 3001`。应用只监听 `127.0.0.1:3001`。

## 5. 安装基础工具

```bash
apt install -y \
  ca-certificates curl git jq xz-utils build-essential sqlite3 \
  debian-keyring debian-archive-keyring apt-transport-https gnupg
```

## 6. 安装 Node.js 24 LTS

以下命令从 Node.js 官方发布站获取最新的 v24 LTS x64 二进制包：

```bash
NODE_VERSION="$(
  curl -fsSL https://nodejs.org/dist/index.json |
  jq -r '[.[] | select(.lts != false and (.version | startswith("v24.")))][0].version'
)"

test -n "$NODE_VERSION" && test "$NODE_VERSION" != "null"

curl -fsSLO \
  "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz"

tar -xJf "node-$NODE_VERSION-linux-x64.tar.xz" -C /opt

ln -sfn "/opt/node-$NODE_VERSION-linux-x64/bin/node" /usr/local/bin/node
ln -sfn "/opt/node-$NODE_VERSION-linux-x64/bin/npm" /usr/local/bin/npm
ln -sfn "/opt/node-$NODE_VERSION-linux-x64/bin/npx" /usr/local/bin/npx

rm "node-$NODE_VERSION-linux-x64.tar.xz"

node --version
npm --version
```

## 7. 安装 Caddy

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
  tee /etc/apt/sources.list.d/caddy-stable.list

chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod o+r /etc/apt/sources.list.d/caddy-stable.list

apt update
apt install -y caddy
caddy version
```

## 8. 在本地打包项目

由于当前代码包含尚未推送的部署文件，建议第一次直接从本地上传。先在本地停止
XMT 服务，然后打开 Windows PowerShell：

```powershell
Set-Location E:\houtai\xmt

tar `
  --exclude=./.git `
  --exclude=./node_modules `
  --exclude=./dist `
  --exclude=./.env `
  --exclude=./data/xmt.db `
  --exclude=./data/xmt.db-wal `
  --exclude=./data/xmt.db-shm `
  --exclude=./data/backups `
  --exclude=./certs `
  --exclude=./logs `
  --exclude=./reports `
  -czf "$env:TEMP\xmt-release.tar.gz" .

tar -tf "$env:TEMP\xmt-release.tar.gz" |
  Select-String "src/data/changelog.ts"

scp "$env:TEMP\xmt-release.tar.gz" root@<ECS公网IP>:/tmp/
```

校验命令必须显示 `src/data/changelog.ts`。如果没有输出，不要上传该压缩包。

如果需要迁移现有业务数据，必须先停止本地 XMT 后端，再打包 SQLite 三件套：

```powershell
Set-Location E:\houtai\xmt
tar -czf "$env:TEMP\xmt-data.tar.gz" data/xmt.db data/xmt.db-wal data/xmt.db-shm
scp "$env:TEMP\xmt-data.tar.gz" root@<ECS公网IP>:/tmp/
```

某个 WAL/SHM 文件不存在时，将不存在的文件从命令中删掉。新系统不需要旧数据时，
跳过数据包上传。

## 9. 创建应用用户并解压代码

回到 ECS：

```bash
useradd \
  --system \
  --home-dir /opt/xmt \
  --shell /usr/sbin/nologin \
  --user-group xmt

install -d -o root -g root -m 0755 /opt/xmt
tar -xzf /tmp/xmt-release.tar.gz -C /opt/xmt

install -d -o xmt -g xmt -m 0750 /opt/xmt/data
install -d -o xmt -g xmt -m 0750 /opt/xmt/logs
```

迁移旧数据时：

```bash
tar -xzf /tmp/xmt-data.tar.gz -C /opt/xmt
chown -R xmt:xmt /opt/xmt/data
chmod 0750 /opt/xmt/data
chmod 0640 /opt/xmt/data/xmt.db*
```

清理上传包：

```bash
rm -f /tmp/xmt-release.tar.gz /tmp/xmt-data.tar.gz
```

## 10. 安装依赖并构建

```bash
cd /opt/xmt
npm ci
npm run check
npm run build
```

安装抖音采集功能需要的 Chromium 和 Linux 依赖：

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/xmt/.playwright \
  npx playwright install --with-deps chromium
```

构建完成后移除纯开发依赖：

```bash
npm prune --omit=dev
chown -R root:root /opt/xmt
chown -R xmt:xmt /opt/xmt/data /opt/xmt/logs
chmod -R a+rX /opt/xmt/.playwright
```

## 11. 创建生产环境变量

生成 JWT 密钥：

```bash
openssl rand -hex 48
```

创建配置目录：

```bash
install -d -o root -g xmt -m 0750 /etc/xmt
nano /etc/xmt/xmt.env
```

有域名时写入：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
JWT_SECRET=替换为openssl生成的随机值
CORS_ORIGINS=https://app.example.com
PLAYWRIGHT_BROWSERS_PATH=/opt/xmt/.playwright
```

暂时只有公网 IP 时：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
JWT_SECRET=替换为openssl生成的随机值
CORS_ORIGINS=http://<ECS公网IP>
PLAYWRIGHT_BROWSERS_PATH=/opt/xmt/.playwright
```

保存后：

```bash
chown root:xmt /etc/xmt/xmt.env
chmod 0640 /etc/xmt/xmt.env
```

JWT 密钥一旦投入使用不要随意更换，否则所有已登录用户会退出。

## 12. 注册 systemd 服务

```bash
cp /opt/xmt/deploy/linux/xmt.service /etc/systemd/system/xmt.service
systemctl daemon-reload
systemctl enable --now xmt
systemctl status xmt --no-pager
```

验证后端：

```bash
curl -fsS http://127.0.0.1:3001/api/health
ss -lntp | grep 3001
```

监听地址必须显示为 `127.0.0.1:3001`，而不是 `0.0.0.0:3001`。

查看日志：

```bash
journalctl -u xmt -n 100 --no-pager
journalctl -u xmt -f
```

## 13. 配置 Caddy

### 方案 A：已有域名

先将域名 A 记录指向 ECS 公网 IP。中国内地 ECS 对公网提供网站服务通常还需完成
ICP备案。

```bash
cp /opt/xmt/deploy/linux/Caddyfile.example /etc/caddy/Caddyfile
sed -i 's/app\.example\.com/你的真实域名/g' /etc/caddy/Caddyfile
install -d -o caddy -g caddy -m 0750 /var/log/caddy

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl status caddy --no-pager
```

Caddy 会自动申请和续期 HTTPS 证书。访问：

```text
https://你的真实域名
```

### 方案 B：暂时只有公网 IP

此方案仅用于临时验证，不提供可信公网 HTTPS：

```bash
cat >/etc/caddy/Caddyfile <<'EOF'
:80 {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3001
}
EOF

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

访问：

```text
http://<ECS公网IP>
```

## 14. 配置每日自动备份

```bash
install -m 0750 \
  /opt/xmt/deploy/linux/backup-xmt.sh \
  /usr/local/sbin/backup-xmt

cp /opt/xmt/deploy/linux/xmt-backup.service \
  /etc/systemd/system/xmt-backup.service

cp /opt/xmt/deploy/linux/xmt-backup.timer \
  /etc/systemd/system/xmt-backup.timer

install -d -o root -g root -m 0750 /var/backups/xmt

systemctl daemon-reload
systemctl enable --now xmt-backup.timer
systemctl start xmt-backup.service

systemctl status xmt-backup.service --no-pager
systemctl list-timers xmt-backup.timer
ls -lh /var/backups/xmt
```

备份默认保留 30 天。还应定期同步到阿里云 OSS；只保存在同一块 ECS 系统盘不能
抵御磁盘损坏或误删。

恢复测试：

```bash
mkdir -p /tmp/xmt-restore-test
gzip -dc /var/backups/xmt/xmt-日期.db.gz \
  >/tmp/xmt-restore-test/xmt.db
sqlite3 /tmp/xmt-restore-test/xmt.db "PRAGMA integrity_check;"
```

结果必须是 `ok`。

## 15. 上线验收

逐项确认：

```bash
systemctl is-enabled xmt caddy xmt-backup.timer
systemctl is-active xmt caddy xmt-backup.timer
curl -fsS http://127.0.0.1:3001/api/health
ss -lntp
ufw status verbose
```

浏览器验收：

1. 登录和退出正常。
2. 页面刷新及深层链接正常。
3. 两个浏览器之间 Socket.IO 实时同步正常。
4. 管理员立即修改 `admin/admin123` 等默认密码。
5. 抖音采集功能能够启动 Chromium。
6. 手动备份和恢复完整性检查成功。

## 16. 日常发布更新

在本地重新生成并上传 `xmt-release.tar.gz`。服务器先在新目录完成依赖安装和
构建，确认成功后再短暂停止服务并切换版本：

```bash
systemctl start xmt-backup.service

rm -rf /opt/xmt.next
install -d -o root -g root -m 0755 /opt/xmt.next
tar -xzf /tmp/xmt-release.tar.gz -C /opt/xmt.next

cd /opt/xmt.next
npm ci
npm run check
npm run build
PLAYWRIGHT_BROWSERS_PATH=/opt/xmt.next/.playwright \
  npx playwright install chromium
npm prune --omit=dev

systemctl stop xmt

mv /opt/xmt/data /opt/xmt.next/data
mv /opt/xmt/logs /opt/xmt.next/logs

previous="/opt/xmt.previous.$(date +%Y%m%d-%H%M%S)"
mv /opt/xmt "$previous"
mv /opt/xmt.next /opt/xmt

chown -R root:root /opt/xmt
chown -R xmt:xmt /opt/xmt/data /opt/xmt/logs
chmod -R a+rX /opt/xmt/.playwright

systemctl start xmt
curl -fsS http://127.0.0.1:3001/api/health
rm -f /tmp/xmt-release.tar.gz
```

不要在更新时覆盖 `/opt/xmt/data` 和 `/etc/xmt/xmt.env`。确认新版本运行稳定后，
再手动删除旧的 `/opt/xmt.previous.*` 目录。

## 17. 常用排障命令

```bash
journalctl -u xmt -n 200 --no-pager
journalctl -u caddy -n 200 --no-pager
systemctl restart xmt
systemctl reload caddy
caddy validate --config /etc/caddy/Caddyfile
curl -v http://127.0.0.1:3001/api/health
df -h
free -h
du -sh /opt/xmt /var/backups/xmt
```

若出现 `502 Bad Gateway`，优先检查 `systemctl status xmt` 和 XMT 日志。若 HTTPS
证书申请失败，检查域名解析、ICP备案状态以及安全组/UFW 的 80、443 端口。
