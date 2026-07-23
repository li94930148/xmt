"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeDiscovery = writeDiscovery;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
function keys(value) { return value && typeof value === 'object' ? Object.keys(value).slice(0, 200) : []; }
async function writeDiscovery(directory, fileName, page, captures) {
    const seen = new Set();
    const discoveries = captures.filter((capture) => capture.page === page).filter((capture) => {
        const key = `${capture.method}|${capture.url.split('?')[0]}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    }).map((capture) => ({ page, url: capture.url.split('?')[0], method: capture.method, responseKeys: keys(capture.response) }));
    await promises_1.default.mkdir(directory, { recursive: true });
    await promises_1.default.writeFile(node_path_1.default.join(directory, fileName), JSON.stringify(discoveries, null, 2), 'utf8');
    return discoveries;
}
