import assert from 'node:assert/strict';
import test from 'node:test';
import { countWritingCharacters, estimatedReadingMinutes, parseWritingGoal } from '../../src/components/editor/writingMetricUtils';

test('字数忽略空白，并按 Unicode 字符统计', () => {
  assert.equal(countWritingCharacters('中文  A\n😊'), 4);
  assert.equal(countWritingCharacters(' \n\t'), 0);
});

test('预计阅读时间按每分钟 300 字向上取整', () => {
  assert.equal(estimatedReadingMinutes(0), 0);
  assert.equal(estimatedReadingMinutes(300), 1);
  assert.equal(estimatedReadingMinutes(301), 2);
});

test('目标字数只接受有效正整数', () => {
  assert.equal(parseWritingGoal('500'), 500);
  for (const invalid of ['', '0', '-1', '1.5', 'NaN', '1000001']) {
    assert.equal(parseWritingGoal(invalid), null);
  }
});
