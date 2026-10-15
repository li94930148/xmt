import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const realtimeToast = fs.readFileSync(path.join(root, 'src/components/RealtimeToast.tsx'), 'utf8');
const socketHook = fs.readFileSync(path.join(root, 'src/hooks/useSocket.ts'), 'utf8');
const notificationUtility = fs.readFileSync(path.join(root, 'src/utils/notification.ts'), 'utf8');
const messagesPage = fs.readFileSync(path.join(root, 'src/pages/Messages.tsx'), 'utf8');
const mobileMessagesPage = fs.readFileSync(path.join(root, 'src/pages/mobile/MobileMessages.tsx'), 'utf8');

assert.doesNotMatch(realtimeToast, /notifyDesktop|showDesktopNotification/, '房间实时 toast 不得重复触发系统桌面通知');
assert.match(realtimeToast, /toastListener\?\.\(\{ \.\.\.item, id \}\)/, '房间实时事件仍须显示页面内 toast');
assert.match(socketHook, /nextSocket\.on\('new_message',[\s\S]*?notifyDesktop\(/, '持久化个人消息仍统一负责桌面通知');
assert.match(socketHook, /buildMessageDesktopNotification\(message, desktopMessageGroups\)/, '个人消息桌面提醒须经过聚合与站内链接校验');
assert.match(socketHook, /nextSocket\.on\('connect',[\s\S]*?getUnreadCount\(\)[\s\S]*?xmt-messages-refresh/, 'socket reconnect must refresh missed unread count and persisted message state');
assert.match(socketHook, /nextSocket\.on\('new_message',[\s\S]*?xmt-messages-refresh/, 'a realtime message must refresh the visible message list');
assert.match(messagesPage, /addEventListener\('xmt-messages-refresh'/, 'desktop message list reloads persisted notifications after realtime events or reconnect');
assert.match(mobileMessagesPage, /addEventListener\('xmt-messages-refresh'/, 'mobile message list reloads persisted notifications after realtime events or reconnect');
assert.match(notificationUtility, /isNotifySoundEnabled\(\) && !options\.silent/, '聚合后的提醒更新不得重复播放提示音');

console.log('Realtime toast and desktop notification routing contract passed');
