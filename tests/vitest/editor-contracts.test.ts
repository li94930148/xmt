import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WritingMetrics from '../../src/components/editor/WritingMetrics';
import { confirmManualEditorSave } from '../../src/components/editor/manualSaveConfirmation.js';
import { buildMissingOutlineSkeleton, extractOutlineHeadings } from '../../src/components/editor/outlineSkeleton';
import { countWritingCharacters, estimatedReadingMinutes, parseWritingGoal } from '../../src/components/editor/writingMetricUtils';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const priorDomParser = Object.getOwnPropertyDescriptor(globalThis, 'DOMParser');

beforeAll(() => {
  Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: dom.window.DOMParser });
});

afterAll(() => {
  dom.window.close();
  if (priorDomParser) Object.defineProperty(globalThis, 'DOMParser', priorDomParser);
  else Reflect.deleteProperty(globalThis, 'DOMParser');
});

describe('Outline skeleton', () => {
  it('extracts real headings, keeps section levels, and removes duplicates', () => {
    expect(extractOutlineHeadings('<p>说明段落</p><h1>开场</h1><h3>采访  要点</h3><h5>收尾</h5><h2>开场</h2>')).toEqual([
      { title: '开场', level: 2 },
      { title: '采访 要点', level: 3 },
      { title: '收尾', level: 4 },
    ]);
  });

  it('adds only missing headings and keeps heading text escaped as HTML', () => {
    const headings = extractOutlineHeadings('<h2>已有小节</h2><h2>新小节 &lt;img onerror=alert(1)&gt;</h2>');
    const skeleton = buildMissingOutlineSkeleton(headings, '<h2>已有小节</h2><p>已写内容</p>');
    expect(skeleton.count).toBe(1);
    expect(skeleton.html).toBe('<h2>新小节 &lt;img onerror=alert(1)&gt;</h2><p></p>');
    expect(buildMissingOutlineSkeleton(headings, '<h2>已有小节</h2><h2>新小节 &lt;img onerror=alert(1)&gt;</h2>').count).toBe(0);
  });
});

describe('Manual editor save', () => {
  it('waits for an asynchronous server-confirmed save before reporting success', async () => {
    let resolveSave!: (value: boolean) => void;
    let settled = false;
    const save = new Promise<boolean>((resolve) => { resolveSave = resolve; });
    const result = confirmManualEditorSave(() => save).then((confirmed) => {
      settled = true;
      return confirmed;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    resolveSave(true);
    expect(await result).toBe(true);
  });

  it('does not treat rejected or explicitly unconfirmed saves as successful', async () => {
    expect(await confirmManualEditorSave(async () => false)).toBe(false);
    expect(await confirmManualEditorSave(async () => { throw new Error('save rejected'); })).toBe(false);
  });

  it('keeps synchronous void callbacks compatible', async () => {
    expect(await confirmManualEditorSave(() => undefined)).toBe(true);
  });
});

describe('Writing metrics', () => {
  it('counts non-whitespace Unicode characters', () => {
    expect(countWritingCharacters('中文  A\n😊')).toBe(4);
    expect(countWritingCharacters(' \n\t')).toBe(0);
  });

  it('rounds reading time up at 300 characters per minute', () => {
    expect(estimatedReadingMinutes(0)).toBe(0);
    expect(estimatedReadingMinutes(300)).toBe(1);
    expect(estimatedReadingMinutes(301)).toBe(2);
  });

  it('accepts only valid positive integer goals', () => {
    expect(parseWritingGoal('500')).toBe(500);
    for (const invalid of ['', '0', '-1', '1.5', 'NaN', '1000001']) {
      expect(parseWritingGoal(invalid)).toBeNull();
    }
  });

  it('renders a stable field name and accessible label', () => {
    const markup = renderToStaticMarkup(createElement(WritingMetrics, { count: 12, readOnly: false }));
    expect(markup).toMatch(/name="writingGoal"/);
    expect(markup).toMatch(/aria-label="目标字数"/);
  });
});
