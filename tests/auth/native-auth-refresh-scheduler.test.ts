import assert from 'node:assert/strict';
import { MobileRefreshError } from '../../src/api/auth.ts';
import { createNativeAuthRuntime } from '../../src/auth/native/native-auth-runtime.ts';

const token = (exp: number) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;

class Clock {
  now = 0;
  private next = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();
  set = (callback: () => void, delay: number) => {
    const id = ++this.next;
    this.timers.set(id, { at: this.now + delay, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  clear = (id: ReturnType<typeof setTimeout>) => { this.timers.delete(id as unknown as number); };
  async advance(ms: number) {
    this.now += ms;
    const due = [...this.timers.entries()].filter(([, timer]) => timer.at <= this.now);
    for (const [id, timer] of due) { this.timers.delete(id); timer.callback(); }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  get size() { return this.timers.size; }
}

function fixture(clock: Clock, refreshRequest: () => Promise<{ accessToken: string; refreshToken: string }>) {
  let access = token(900);
  let refresh = 'refresh-0';
  let logoutCalls = 0;
  let clearCalls = 0;
  const runtime = createNativeAuthRuntime({
    getAccessToken: () => access,
    getUser: () => ({ id: 40, name: 'mobile' }) as never,
    getRefreshToken: async () => refresh,
    setRefreshToken: async (value) => { refresh = value; },
    clearRefreshToken: async () => { clearCalls += 1; },
    clearUser: () => { clearCalls += 1; },
    login: (_user, next) => { access = next; },
    logout: () => { logoutCalls += 1; access = null as never; },
    refreshRequest,
    now: () => clock.now,
    setTimer: clock.set,
    clearTimer: clock.clear,
    refreshLeadMs: 60_000,
    retryBaseMs: 1_000,
  });
  return { runtime, state: () => ({ access, refresh, logoutCalls, clearCalls }) };
}

const clock = new Clock();
let refreshCalls = 0;
const first = fixture(clock, async () => ({ accessToken: token(1800 + Math.floor(clock.now / 1000)), refreshToken: `refresh-${++refreshCalls}` }));
first.runtime.start();
assert.equal(clock.size, 1, 'healthy token schedules a lead-time refresh');
await clock.advance(840_000);
assert.equal(refreshCalls, 1, 'expiry timer performs refresh');
assert.equal(first.state().refresh, 'refresh-1', 'refresh credential rotates');
assert.equal(clock.size, 1, 'successful refresh schedules the next cycle');
await first.runtime.onResume();
await first.runtime.onNetworkOnline();
assert.equal(refreshCalls, 1, 'healthy resume/network events do not refresh');

const nearClock = new Clock();
nearClock.now = 850_000;
let concurrentCalls = 0;
const near = fixture(nearClock, async () => { concurrentCalls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { accessToken: token(1800), refreshToken: 'rotated' }; });
await Promise.all([near.runtime.onResume(), near.runtime.onNetworkOnline(), near.runtime.onResume()]);
assert.equal(concurrentCalls, 1, 'resume and network recovery share one refresh flight');

const transientClock = new Clock();
transientClock.now = 850_000;
const transient = fixture(transientClock, async () => { throw new MobileRefreshError('network', false); });
await transient.runtime.onResume();
assert.equal(transient.state().logoutCalls, 0, 'transient failure preserves signed-in state');
assert.equal(transient.state().clearCalls, 0, 'transient failure preserves Keystore credential');
assert.equal(transientClock.size, 1, 'transient failure has bounded retry scheduling');

const terminalClock = new Clock();
terminalClock.now = 850_000;
const terminal = fixture(terminalClock, async () => { throw new MobileRefreshError('revoked', true, 401, 'AUTH_REFRESH_INVALID'); });
await terminal.runtime.onResume();
assert.equal(terminal.state().logoutCalls, 1, 'terminal failure logs out');
assert.equal(terminal.state().clearCalls, 2, 'terminal failure clears user and Keystore credential');

const cleanupClock = new Clock();
const cleanup = fixture(cleanupClock, async () => ({ accessToken: token(1800), refreshToken: 'unused' }));
cleanup.runtime.start();
cleanup.runtime.stop();
assert.equal(cleanupClock.size, 0, 'stop clears the scheduled refresh');
console.log('native auth refresh scheduler tests passed');
