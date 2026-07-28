"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.capabilities = capabilities;
function capabilities(engine, runtime) {
    const chromium = engine === 'chromium';
    return { supportsPersistentContext: runtime !== 'external-cdp', supportsCdp: chromium, supportsNetworkResponseInspection: true, supportsRequestInterception: true, supportsDownloads: true, supportsMultiPage: true, supportsExistingSessionConnection: runtime === 'external-cdp', supportsManagedProfile: runtime !== 'external-cdp', supportsHeadless: runtime !== 'external-cdp', supportsCreatorCenter: chromium };
}
