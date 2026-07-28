"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserRegistry = void 0;
const browserSession_js_1 = require("./browserSession.js");
const profile_js_1 = require("./profile.js");
class BrowserRegistry {
    dataRoot;
    found;
    constructor(dataRoot, found) {
        this.dataRoot = dataRoot;
        this.found = found;
    }
    list() { return [...this.found]; }
    get(id) { return this.found.find(item => item.id === id); }
    create(selection, accountId) { const info = this.get(selection.id); if (!info)
        throw new Error(`浏览器 ${selection.id} 不可用，请重新执行浏览器发现`); if (selection.sessionMode === 'connect-cdp') {
        if (!selection.cdpEndpoint)
            throw new Error('外部 CDP 模式缺少连接地址');
        return new browserSession_js_1.ExternalCdpSession(info, selection.cdpEndpoint);
    } return new browserSession_js_1.ManagedBrowserSession(info, selection, (0, profile_js_1.managedProfile)(this.dataRoot, selection, accountId), this.dataRoot); }
}
exports.BrowserRegistry = BrowserRegistry;
