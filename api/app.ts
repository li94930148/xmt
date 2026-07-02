/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'http'
import https from 'https'
import fs from 'fs'
import { Server } from 'socket.io'
import { initDatabase, closeDatabase } from './database/db.js'
import { queryOne } from './database/utils.js'
import { verifyToken } from './utils/jwt.js'
import { ADMIN_SOCKET_ROOM, PUBLIC_SOCKET_ROOMS, setSocketIO } from './utils/socket.js'
import { apiLimiter } from './middleware/rateLimit.js'
import authRoutes from './routes/auth.js'
import topicsRoutes from './routes/topics.js'
import usersRoutes from './routes/users.js'
import messagesRoutes from './routes/messages.js'
import analyticsRoutes from './routes/analytics.js'
import resourcesRoutes from './routes/resources.js'
import workflowRoutes from './routes/workflow.js'
import inspirationsRoutes from './routes/inspirations.js'
import templatesRoutes from './routes/templates.js'
import achievementsRoutes from './routes/achievements.js'
import announcementsRoutes from './routes/announcements.js'
import pomodoroRoutes from './routes/pomodoro.js'
import calendarRoutes from './routes/calendar.js'
import exportRoutes from './routes/export.js'
import douyinRoutes from './routes/douyin.js'
import backupRoutes from './routes/backup.js'
import { createBackup, cleanOldBackups } from './routes/backup.js'
import rolesRoutes from './routes/roles.js'
import permissionsRoutes from './routes/permissions.js'
import workflowTemplatesRoutes from './routes/workflow-templates.js'
import notificationsRoutes from './routes/notifications.js'
import systemSettingsRoutes from './routes/system-settings.js'
import dailyReportsRoutes from './routes/daily-reports.js'
import retrospectivesRoutes from './routes/retrospectives.js'
import collaborationDashboardRoutes from './routes/collaboration-dashboard.js'
import collaborationUxRoutes from './routes/collaboration-ux.js'
import contentIntelligenceRoutes from './routes/content-intelligence.js'
import contentGenerationRoutes from './routes/content-generation.js'
import contentOrchestratorRoutes from './routes/content-orchestrator.js'
import { COLLABORATION_EVENTS } from '../src/collaboration/core/events.js'
import {
  handleAwarenessUpdate,
  handleDocumentUpdate,
  handleTyping,
  heartbeat,
  joinRoom as joinCollaborationRoom,
  leaveAllRooms,
  leaveRoom as leaveCollaborationRoom,
  lockRoom as lockCollaborationRoom,
  unlockRoom as unlockCollaborationRoom,
} from './collaboration/core/roomManager.js'
import { autoSnapshot } from './collaboration/recovery/documentSnapshot.js'
import { cleanupInactiveRooms } from './collaboration/yjs/documentStore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app: express.Application = express()

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]

function parseConfiguredOrigins(value?: string) {
  if (!value) {
    return new Set(DEFAULT_ALLOWED_ORIGINS.map((origin) => origin.toLowerCase()))
  }

  return new Set(
    value
      .split(',')
      .map((origin) => origin.trim().toLowerCase())
      .filter(Boolean),
  )
}

function isPrivateNetworkHost(hostname: string) {
  const normalized = hostname.toLowerCase()

  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') {
    return true
  }

  const parts = normalized.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false
  }

  const [first, second] = parts
  if (first === 10 || first === 127) return true
  if (first === 192 && second === 168) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  return false
}

function normalizeOrigin(origin: string) {
  try {
    const url = new URL(origin)
    if (!/^https?:$/i.test(url.protocol)) {
      return null
    }

    return {
      origin: url.origin.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
    }
  } catch {
    return null
  }
}

function normalizeHostHeader(hostHeader?: string) {
  if (!hostHeader) return null
  const trimmed = hostHeader.trim().toLowerCase()
  if (!trimmed) return null

  try {
    const url = new URL(`http://${trimmed}`)
    return url.host.toLowerCase()
  } catch {
    return null
  }
}

// 信任反向代理（nginx等），使 req.ip 获取真实客户端 IP
app.set('trust proxy', 1)

// 自动检测 HTTPS 证书（局域网桌面通知需要 HTTPS）
const certsDir = path.join(__dirname, '..', 'certs')
const keyPath = path.join(certsDir, 'server.key')
const certPath = path.join(certsDir, 'server.cert')
let server: http.Server
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  }
  server = https.createServer(sslOptions, app)
  console.log('[HTTPS] 已加载 SSL 证书，HTTPS 模式启动')
} else {
  server = http.createServer(app)
  console.log('[HTTP] 未检测到 certs/ 目录下的证书，HTTP 模式启动')
  console.log('[HTTP] 桌面通知功能需要 HTTPS，运行 node scripts/generate-cert.mjs 生成证书')
}

const allowedOrigins = parseConfiguredOrigins(process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS)

function isAllowedRequestOrigin(origin?: string, hostHeader?: string) {
  if (!origin) return true

  const normalizedOrigin = normalizeOrigin(origin)
  if (!normalizedOrigin) return false

  if (allowedOrigins.has(normalizedOrigin.origin)) {
    return true
  }

  const normalizedHost = normalizeHostHeader(hostHeader)
  if (normalizedHost && normalizedOrigin.origin === `http://${normalizedHost}`) {
    return true
  }
  if (normalizedHost && normalizedOrigin.origin === `https://${normalizedHost}`) {
    return true
  }

  return isPrivateNetworkHost(normalizedOrigin.hostname)
}

export const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedRequestOrigin(origin)) return callback(null, true)
      callback(new Error('CORS not allowed'))
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  allowRequest: (req, callback) => {
    callback(null, isAllowedRequestOrigin(req.headers.origin, req.headers.host))
  },
})

type SocketHandshakeLike = {
  headers?: {
    origin?: string
  }
}

function getSocketOrigin(socket: { handshake?: SocketHandshakeLike }) {
  return socket.handshake?.headers?.origin || 'unknown'
}

function getSocketTransport(socket: { conn?: { transport?: { name?: string } } }) {
  return socket.conn?.transport?.name || 'unknown'
}

function logSocketAuthFailed(
  reason: string,
  socket: { id?: string; handshake?: SocketHandshakeLike; conn?: { transport?: { name?: string } } },
) {
  console.warn('[Socket][auth failed]', {
    reason,
    socketId: socket.id,
    origin: getSocketOrigin(socket),
    transport: getSocketTransport(socket),
  })
}

io.engine.on('connection_error', (error: Error & {
  code?: number
  context?: unknown
  req?: http.IncomingMessage
}) => {
  console.warn('[Socket][engine connection_error]', {
    code: error.code,
    message: error.message,
    context: error.context,
    origin: error.req?.headers?.origin,
    url: error.req?.url,
  })
})

const corsOptions: cors.CorsOptionsDelegate<Request> = (req, callback) => {
  callback(null, {
    origin: (origin, allow) => {
      if (isAllowedRequestOrigin(origin, req.headers.host)) return allow(null, true)
      allow(new Error('CORS not allowed'))
    },
    credentials: true,
  })
}

app.use('/api', cors(corsOptions))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 全局 API 限制
app.use('/api/', apiLimiter)

// 生产环境：服务前端静态文件
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    const relativePath = path.relative(distPath, filePath).replace(/\\/g, '/')
    const isHtmlEntry = relativePath === 'index.html'
    const isHashedAsset = /^assets\/.+\.[a-z0-9]{8,}\.(js|mjs|css)$/i.test(relativePath)

    if (isHtmlEntry) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    } else if (isHashedAsset) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }

    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript')
    if (filePath.endsWith('.mjs')) res.setHeader('Content-Type', 'application/javascript')
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css')
    if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm')
  },
}))

app.use('/api/auth', authRoutes)
app.use('/api/topics', topicsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/resources', resourcesRoutes)
app.use('/api/workflow', workflowRoutes)
app.use('/api/inspirations', inspirationsRoutes)
app.use('/api/templates', templatesRoutes)
app.use('/api/achievements', achievementsRoutes)
app.use('/api/announcements', announcementsRoutes)
app.use('/api/pomodoro', pomodoroRoutes)
app.use('/api/calendar', calendarRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/douyin', douyinRoutes)
app.use('/api/backup', backupRoutes)
app.use('/api/roles', rolesRoutes)
app.use('/api/permissions', permissionsRoutes)
app.use('/api/workflow-templates', workflowTemplatesRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/system-settings', systemSettingsRoutes)
app.use('/api/daily-reports', dailyReportsRoutes)
app.use('/api/retrospectives', retrospectivesRoutes)
app.use('/api/collaboration', collaborationDashboardRoutes)
app.use('/api/collaboration/ux', collaborationUxRoutes)
app.use('/api/content/intelligence', contentIntelligenceRoutes)
app.use('/api/content/generation', contentGenerationRoutes)
app.use('/api/content/os', contentOrchestratorRoutes)

app.use(
  '/api/health',
  async (req: Request, res: Response): Promise<void> => {
    void req

    try {
      await queryOne('SELECT 1 as ok')
      res.status(200).json({
        success: true,
        status: 'ok',
        service: 'xmt-api',
        environment: process.env.NODE_ENV || 'development',
        time: new Date().toISOString(),
        database: {
          ok: true,
        },
      })
    } catch {
      res.status(503).json({
        success: false,
        status: 'degraded',
        service: 'xmt-api',
        environment: process.env.NODE_ENV || 'development',
        time: new Date().toISOString(),
        database: {
          ok: false,
        },
      })
    }
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  void error
  void next
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

// 404 处理：API 路由返回 JSON，其他返回前端 index.html
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      success: false,
      error: 'API not found',
    })
  } else if (req.path.match(/\.(js|mjs|css|wasm|png|jpg|svg|ico|woff2?)$/)) {
    // 资源文件请求但未找到，返回 404 而不是 SPA fallback
    res.status(404).end()
  } else {
    // SPA 路由：所有非 API 请求返回 index.html
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.sendFile(path.join(distPath, 'index.html'))
  }
})

setSocketIO(io)

io.use(async (socket, next) => {
  try {
    const token =
      typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : null

    if (!token) {
      logSocketAuthFailed('missing_token', socket)
      return next(new Error('Authentication required'))
    }

    const payload = verifyToken(token)
    if (!payload) {
      logSocketAuthFailed('invalid_token', socket)
      return next(new Error('Invalid token'))
    }

    const user = await queryOne(`SELECT id, username, role, name, enabled FROM users WHERE id = ?`, [payload.userId])
    if (!user) {
      logSocketAuthFailed('invalid_token', socket)
      return next(new Error('User not found'))
    }

    const record = user as Record<string, unknown>
    if (Number(record.enabled) !== 1) {
      logSocketAuthFailed('user_disabled', socket)
      return next(new Error('User disabled'))
    }

    socket.data.user = {
      id: Number(record.id),
      username: String(record.username),
      role: String(record.role),
      name: String(record.name),
    }

    next()
  } catch {
    logSocketAuthFailed('auth_exception', socket)
    next(new Error('Authentication failed'))
  }
})

io.on('connection', (socket) => {
  const socketUser = socket.data.user as { id: number; role: string } | undefined

  if (!socketUser) {
    socket.disconnect(true)
    return
  }

  console.info('[Socket] connected', {
    socketId: socket.id,
    userId: socket.data.user?.id,
    origin: socket.handshake.headers.origin,
    transport: socket.conn.transport.name,
  })

  socket.join(`user_${socketUser.id}`)

  if (socketUser.role === 'admin' || socketUser.role === 'director') {
    socket.join(ADMIN_SOCKET_ROOM)
  }

  socket.on('join', (room: string) => {
    if (PUBLIC_SOCKET_ROOMS.has(room)) {
      socket.join(room)
    }
  })

  socket.on('leave', (room: string) => {
    if (PUBLIC_SOCKET_ROOMS.has(room)) {
      socket.leave(room)
    }
  })

  socket.on(COLLABORATION_EVENTS.JOIN, (payload) => {
    joinCollaborationRoom(io, socket, payload)
  })

  socket.on(COLLABORATION_EVENTS.LEAVE, (payload) => {
    const roomId = typeof payload === 'string' ? payload : String(payload?.roomId || '')
    leaveCollaborationRoom(io, socket, roomId)
  })

  socket.on(COLLABORATION_EVENTS.HEARTBEAT, (payload) => {
    const roomId = typeof payload === 'string' ? payload : String(payload?.roomId || '')
    heartbeat(io, socket, roomId)
  })

  socket.on(COLLABORATION_EVENTS.UPDATE, (payload) => {
    handleDocumentUpdate(io, socket, payload)
  })

  socket.on(COLLABORATION_EVENTS.AWARENESS_UPDATE, (payload) => {
    handleAwarenessUpdate(socket, payload)
  })

  socket.on(COLLABORATION_EVENTS.TYPING, (payload) => {
    handleTyping(io, socket, payload)
  })

  socket.on(COLLABORATION_EVENTS.DOC_LOCKED, (payload) => {
    const socketUser = socket.data.user as { id?: number; role?: string } | undefined
    if (socketUser?.role !== 'admin' && socketUser?.role !== 'director') return
    const roomId = String(payload?.roomId || payload?.docId || '')
    if (!roomId) return
    lockCollaborationRoom(io, roomId, String(payload?.reason || 'Document locked'), String(socketUser.id || 'system'))
  })

  socket.on(COLLABORATION_EVENTS.DOC_UNLOCKED, (payload) => {
    const socketUser = socket.data.user as { id?: number; role?: string } | undefined
    if (socketUser?.role !== 'admin' && socketUser?.role !== 'director') return
    const roomId = String(payload?.roomId || payload?.docId || '')
    if (!roomId) return
    unlockCollaborationRoom(io, roomId, String(socketUser.id || 'system'))
  })

  socket.on('disconnect', (reason) => {
    console.info('[Socket] disconnected', {
      socketId: socket.id,
      userId: socket.data.user?.id,
      reason,
    })
    leaveAllRooms(io, socket)
  })
})

export async function startServer() {
  await initDatabase()

  const PORT = Number.parseInt(process.env.PORT || '3001', 10)
  const HOST = process.env.HOST || '0.0.0.0'
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`)
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error)
    }

    server.once('error', onError)
    server.listen(PORT, HOST, () => {
      server.off('error', onError)
      const protocol = server instanceof https.Server ? 'https' : 'http'
      console.log(`Server ready on ${protocol}://${HOST}:${PORT}`)
      resolve()
    })
  })

  autoSnapshot(30000, (snapshot) => {
    io.to(snapshot.docId).emit(COLLABORATION_EVENTS.SNAPSHOT_CREATED, {
      docId: snapshot.docId,
      snapshotId: snapshot.id,
      version: snapshot.version,
      createdAt: snapshot.createdAt,
    })
  })

  setInterval(() => {
    cleanupInactiveRooms()
  }, 60 * 1000)

  // 启动时自动备份一次
  try {
    const name = await createBackup()
    console.log(`[Backup] 启动备份: ${name}`)
    cleanOldBackups()
  } catch (e) {
    console.warn('[Backup] 启动备份失败:', e)
  }

  // 每天凌晨3点自动备份
  setInterval(() => {
    void (async () => {
    const now = new Date()
    if (now.getHours() === 3 && now.getMinutes() === 0) {
      try {
        const name = await createBackup()
        console.log(`[Backup] 定时备份: ${name}`)
        cleanOldBackups()
      } catch (e) {
        console.warn('[Backup] 定时备份失败:', e)
      }
    }
    })()
  }, 60 * 1000)

}

// 优雅关闭：进程退出前保存数据库
process.on('SIGINT', () => {
  console.log('[Server] 收到 SIGINT，正在保存数据库...')
  closeDatabase()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[Server] 收到 SIGTERM，正在保存数据库...')
  closeDatabase()
  process.exit(0)
})

export default app
