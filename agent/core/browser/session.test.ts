import assert from 'node:assert/strict';
import test from 'node:test';
import { getDouyinCreatorLoginState } from './session.js';
import { managedProfile, assertManagedProfile } from './profile.js';

function page(url: string, body = '', login = false, readable = true) {
  return { waitForLoadState: async () => undefined, url: () => url, locator: () => ({ innerText: async () => { if (!readable) throw new Error('unreadable'); return body; } }), getByText: () => ({ first: () => ({ isVisible: async () => login }) }) };
}
async function status(url: string, body = '', login = false, readable = true) { return (await getDouyinCreatorLoginState(page(url, body, login, readable) as never)).status; }

test('不同账号和浏览器使用独立资料目录', () => { const root = '/tmp/XMT Creator Agent'; const profile = managedProfile(root, { type: 'custom', profileName: 'profile-a' }, 'account-a'); assert.equal(profile, '/tmp/XMT Creator Agent/profiles/custom/account-a/profile-a'); assert.equal(assertManagedProfile(profile, `${root}/profiles`), profile); assert.throws(() => assertManagedProfile('/tmp/outside', `${root}/profiles`)); });
test('受保护 Creator 页面无需固定导航文字也判为已登录', async () => { assert.equal(await status('https://creator.douyin.com/creator-micro/home'), 'logged_in'); assert.equal(await status('https://creator.douyin.com/creator-micro/home', '内容管理'), 'logged_in'); });
test('折叠导航的 Creator 受保护路径仍判为已登录', async () => { assert.equal(await status('https://creator.douyin.com/creator-center/data'), 'logged_in'); });
test('可见登录控件判为需要登录', async () => { assert.equal(await status('https://creator.douyin.com/creator-micro/home', '', true), 'login_required'); });
test('明确登录或认证 URL 判为需要登录', async () => { assert.equal(await status('https://creator.douyin.com/login'), 'login_required'); assert.equal(await status('https://sso.douyin.com/auth'), 'login_required'); });
test('无法可靠判断时返回 unknown', async () => { assert.equal(await status('https://creator.douyin.com/', '', false), 'unknown'); assert.equal(await status('https://example.invalid/loading'), 'unknown'); assert.equal(await status('https://creator.douyin.com/creator-micro/home', '', false, false), 'unknown'); });
