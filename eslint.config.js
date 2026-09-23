import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // 构建副本与 Python 环境内的第三方声明不是项目源码。
  { ignores: ['**/node_modules/**', '**/dist/**', 'agent/dist-*/**', 'agent/release*/**', 'agent/.collector-runtime-build/**', 'collector/.venv*/**', 'android/.gradle/**', 'android/**/build/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 历史代码债务继续在日志中可见；类型检查、构建和安全契约仍作为阻断门禁。
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-empty': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
)
