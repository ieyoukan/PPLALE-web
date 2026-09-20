import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import security from 'eslint-plugin-security'
import unicorn from 'eslint-plugin-unicorn'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    plugins: {
      security,
      unicorn,
    },
    rules: {
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'warn',
      'react-hooks/set-state-in-effect': 'off',

      'unicorn/better-regex': 'warn',
      'unicorn/consistent-destructuring': 'warn',
      'unicorn/no-array-push-push': 'error',
      'unicorn/no-console-spaces': 'warn',
      'unicorn/no-for-loop': 'warn',
      'unicorn/prefer-includes': 'warn',
      'unicorn/prefer-string-starts-ends-with': 'warn',
    },
  },
  {
    files: ['src/app/api/og/**/*.tsx'],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
    'styled-system/**',
  ]),
])
