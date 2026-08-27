import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // react-three-fiber では uniform / Object3D を useFrame 内で直接書き換えるのが
    // 公式パターン。React Compiler 系の immutability・refs ルールとは両立しないため
    // example 配下に限って無効化する。
    files: ['src/examples/**/*.{js,jsx}', 'src/shared/**/*.{js,jsx}'],
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // example は 1 ファイルにシーン定義とコンポーネントが同居することがある。
      // HMR の粒度より読みやすさを優先する
      'react-refresh/only-export-components': 'off',
    },
  },
])
