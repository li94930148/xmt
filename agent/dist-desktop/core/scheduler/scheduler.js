"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.intervalMs = intervalMs;
exports.nextDailyDelay = nextDailyDelay;
function intervalMs(interval) { return interval === '12h' ? 12 * 60 * 60 * 1000 : interval === 'daily' ? 24 * 60 * 60 * 1000 : 0; }
function nextDailyDelay(hour) { const now = new Date(); const next = new Date(now); next.setHours(hour, 0, 0, 0); if (next <= now)
    next.setDate(next.getDate() + 1); return next.getTime() - now.getTime(); }
