"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.managedProfile = managedProfile;
exports.assertManagedProfile = assertManagedProfile;
const node_path_1 = __importDefault(require("node:path"));
function managedProfile(root, selection, accountId = 'default') {
    const safe = (value) => value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'default';
    return node_path_1.default.resolve(root, 'profiles', selection.type, safe(accountId), safe(selection.profileName));
}
function assertManagedProfile(profile, root) { const resolved = node_path_1.default.resolve(profile), base = node_path_1.default.resolve(root); if (resolved === base || !resolved.startsWith(`${base}${node_path_1.default.sep}`))
    throw new Error('浏览器资料目录必须位于 Creator Agent 数据目录内'); return resolved; }
