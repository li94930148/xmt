import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultReactBitsAppearanceConfig, REACT_BITS_APPEARANCE_KEY, type ReactBitsAppearanceConfig } from '../../src/features/reactbits-appearance/types';
import { reactBitsPresets } from '../../src/features/reactbits-appearance/presets';
import { useReactBitsAppearanceStore } from '../../src/store/reactBitsAppearanceStore';

const copy = (config: ReactBitsAppearanceConfig) => JSON.parse(JSON.stringify(config)) as ReactBitsAppearanceConfig;

test('首次和恢复默认的外观配置关闭背景、组件动效与页面应用范围', () => {
  const expected = copy(defaultReactBitsAppearanceConfig);
  assert.equal(expected.background.component, 'none');
  assert.equal(expected.background.intensity, 'low');
  assert.equal(expected.headingText.component, 'none');
  assert.equal(expected.numberText.component, 'none');
  assert.equal(expected.buttonSurface.component, 'standard');
  assert.equal(expected.buttonInteraction.component, 'none');
  assert.equal(expected.card.component, 'standard');
  assert.equal(expected.reveal.component, 'none');
  assert.equal(expected.motionMode, 'off');
  assert.ok(Object.values(expected.applyTo).every((enabled) => !enabled));

  useReactBitsAppearanceStore.setState({ config: copy(expected), draftConfig: copy(expected) });
  useReactBitsAppearanceStore.getState().setDraftField('background.component', 'aurora');
  useReactBitsAppearanceStore.getState().reset();

  assert.deepEqual(useReactBitsAppearanceStore.getState().draftConfig, expected);
  assert.deepEqual(useReactBitsAppearanceStore.getState().config, expected, 'reset edits only the draft until the user saves');
});

test('显式选择的动效预设仍完整启用各自背景与页面范围', () => {
  const byId = Object.fromEntries(reactBitsPresets.map((preset) => [preset.id, preset.config]));

  assert.equal(byId.aurora.background.component, 'aurora');
  assert.equal(byId.aurora.motionMode, 'balanced');
  assert.equal(byId.aurora.applyTo.login, true);
  assert.equal(byId.aurora.applyTo.home, true);
  assert.equal(byId['deep-space'].background.component, 'dark-veil');
  assert.equal(byId.silk.background.component, 'silk');
  assert.equal(byId.linear.background.component, 'threads');
  assert.equal(byId.minimal.motionMode, 'reduced');

  useReactBitsAppearanceStore.setState({ config: copy(defaultReactBitsAppearanceConfig), draftConfig: copy(defaultReactBitsAppearanceConfig) });
  useReactBitsAppearanceStore.getState().applyPreset('aurora');
  assert.deepEqual(useReactBitsAppearanceStore.getState().draftConfig, byId.aurora);
});

test('启动 hydration 保留既有用户保存的外观，不迁移或覆盖显式偏好', () => {
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const savedConfig = copy(reactBitsPresets.find((preset) => preset.id === 'aurora')!.config);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => key === REACT_BITS_APPEARANCE_KEY ? JSON.stringify(savedConfig) : null },
  });
  try {
    useReactBitsAppearanceStore.setState({ config: copy(defaultReactBitsAppearanceConfig), draftConfig: copy(defaultReactBitsAppearanceConfig) });
    useReactBitsAppearanceStore.getState().hydrate();
    assert.deepEqual(useReactBitsAppearanceStore.getState().config, savedConfig);
    assert.deepEqual(useReactBitsAppearanceStore.getState().draftConfig, savedConfig);
  } finally {
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
