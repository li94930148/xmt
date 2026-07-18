import assert from 'node:assert/strict';
import { generateHTML, generateJSON } from '@tiptap/html';
import { createEditorExtensions } from '../src/components/editor/extensions/editorExtensions';
import { topicHtmlMigrationScopeFixtures } from '../tests/fixtures/topic-html-migration-scope.fixture';

export type TopicHtmlMigrationScopeResult = {
  readonly id: string;
  readonly serializedHtml: string;
  readonly reloadHtml: string;
  readonly visualSignalsPreserved: boolean;
  readonly structureStable: boolean;
  readonly editableByCurrentSchema: boolean;
  readonly simulatedSaveAndRefreshStable: boolean;
};

/**
 * This is an offline admission check. It does not fetch or mutate Topic data.
 * The simulated save value is the serialized HTML, and refresh is its reload
 * parse/serialize pass through the current production extension factory.
 */
export function runTopicHtmlMigrationScopeAssessment(): readonly TopicHtmlMigrationScopeResult[] {
  const extensions = createEditorExtensions('fixture');

  return topicHtmlMigrationScopeFixtures.map((fixture) => {
    const source = fixture.legacyHtml || '<p></p>';
    const firstJson = generateJSON(source, extensions);
    const serializedHtml = generateHTML(firstJson, extensions);
    const reloadJson = generateJSON(serializedHtml, extensions);
    const reloadHtml = generateHTML(reloadJson, extensions);
    const visualSignalsPreserved = fixture.expectedReloadSignals.every((signal) => reloadHtml.includes(signal));

    return {
      id: fixture.id,
      serializedHtml,
      reloadHtml,
      visualSignalsPreserved,
      structureStable: serializedHtml === reloadHtml,
      editableByCurrentSchema: Boolean(firstJson.content?.length),
      simulatedSaveAndRefreshStable: serializedHtml === reloadHtml,
    };
  });
}

function main() {
  const results = runTopicHtmlMigrationScopeAssessment();
  assert.equal(results.length, 3);
  for (const result of results) {
    assert.equal(result.visualSignalsPreserved, true, `${result.id} must preserve expected signals`);
    assert.equal(result.structureStable, true, `${result.id} must stabilize after one serialization`);
    assert.equal(result.editableByCurrentSchema, true, `${result.id} must be represented by the current schema`);
    assert.equal(result.simulatedSaveAndRefreshStable, true, `${result.id} must survive simulated save and refresh`);
  }
  console.log(JSON.stringify(results, null, 2));
}

main();
