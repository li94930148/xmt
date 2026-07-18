import assert from 'node:assert/strict';
import { generateHTML, generateJSON } from '@tiptap/html';
import { createEditorExtensions } from '../src/components/editor/extensions/editorExtensions';
import { topicHtmlCompatibilityFixtures } from '../tests/fixtures/topic-html-compatibility.fixture';

export type TopicHtmlCompatibilityResult = {
  id: string;
  serializedHtml: string;
  reloadHtml: string;
  expectedSignalsPresent: string[];
  missingSignals: string[];
  scriptRemoved: boolean;
};

/**
 * Offline admission pipeline: legacy HTML -> Tiptap JSON -> serialized HTML
 * -> simulated saved value -> reload parse/serialize. It uses the production
 * extension factory but does not write a Topic or change any editor code.
 */
export function runTopicHtmlCompatibilityAdmission(): TopicHtmlCompatibilityResult[] {
  const extensions = createEditorExtensions('fixture');
  return topicHtmlCompatibilityFixtures.map((fixture) => {
    const source = fixture.legacyHtml || '<p></p>';
    const firstJson = generateJSON(source, extensions);
    const serializedHtml = generateHTML(firstJson, extensions);
    const reloadJson = generateJSON(serializedHtml, extensions);
    const reloadHtml = generateHTML(reloadJson, extensions);
    const expectedSignalsPresent = fixture.expectedSignals.filter((signal) => reloadHtml.includes(signal));
    const missingSignals = fixture.expectedSignals.filter((signal) => !reloadHtml.includes(signal));

    return {
      id: fixture.id,
      serializedHtml,
      reloadHtml,
      expectedSignalsPresent,
      missingSignals,
      scriptRemoved: !reloadHtml.toLowerCase().includes('<script'),
    };
  });
}

function main() {
  const results = runTopicHtmlCompatibilityAdmission();
  assert.equal(results.length, 8);
  for (const result of results) assert.equal(result.scriptRemoved, true, `${result.id} must not serialize script tags`);
  console.log(JSON.stringify(results, null, 2));
}

main();
