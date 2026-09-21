import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { ySyncPluginKey } from 'y-prosemirror';
import { isLocalEditorChange } from '../../src/components/editor/editorChangeOrigin';
import { productionHistoryTimestamp } from '../../src/lib/productionHistoryTime';
import { formatBjtDisplay } from '../../shared/time';
import { buildUnifiedTimeline } from '../../src/editor/timeline/unifiedContentTimeline';
import { resolveProductionVersionAction } from '../../api/services/productionVersionAction';
import { getProductionVersionRoomId } from '../../src/collaboration/core/events';

assert.equal(resolveProductionVersionAction(undefined), 'none');
assert.equal(resolveProductionVersionAction('paste'), 'none');
assert.equal(resolveProductionVersionAction('major'), 'major');
assert.equal(resolveProductionVersionAction('minor'), 'minor');
assert.equal(getProductionVersionRoomId(110, 'v2.3'), 'production:110@v2.3');
assert.notEqual(getProductionVersionRoomId(110, 'v2.3'), getProductionVersionRoomId(110, 'v3.0'));

const schema = new Schema({ nodes: { doc: { content: 'text*' }, text: {} } });
const state = EditorState.create({ schema });
assert.equal(isLocalEditorChange(state.tr.insertText('粘贴', 0), true), true);
assert.equal(isLocalEditorChange(state.tr.insertText('协作者更新', 0).setMeta(ySyncPluginKey, { isChangeOrigin: true }), true), false);
assert.equal(isLocalEditorChange(state.tr.insertText('普通输入', 0), false), true);

const historyTime = productionHistoryTimestamp('2026-09-21 01:15:24');
assert.equal(formatBjtDisplay(historyTime, { hour: '2-digit', minute: '2-digit', second: '2-digit' }), '09:15:24');

const events = buildUnifiedTimeline('production:110', {
  versionEvents: [{ id: 'history-803', timestamp: historyTime, type: 'snapshot', version: 'v3.0', operatorName: 'A' }],
  saveEvents: [{ id: 'current-110', timestamp: historyTime + 1000, operatorName: 'B' }],
});
assert.deepEqual(events.map((event) => event.type), ['snapshot', 'save']);
assert.equal(events[0].userId, 'A');
assert.equal(events[1].userId, 'B');
console.log('production collaboration and history regression tests passed');
