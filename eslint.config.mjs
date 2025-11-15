// @ts-check

import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import plugin from './eslint-plugin.js';

export default defineConfig(
	[globalIgnores(["dist/"])],
	eslint.configs.recommended,
	tseslint.configs.strict,
	tseslint.configs.stylistic,
	{
		rules: {
			// JavaScript
			'prefer-const': 'off',
			'no-unused-vars': 'off',
			'no-debugger': 'off',
			'space-infix-ops': 'error',
			'curly': 'warn',
			
			// TypeScript
			'@typescript-eslint/no-namespace': 'off',
			'@typescript-eslint/no-inferrable-types': 'off',
			'@typescript-eslint/no-unused-expressions': 'off',
			'@typescript-eslint/consistent-type-definitions': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/prefer-for-of': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			
			// Annoying errors
			'no-empty': 'off',
			'@typescript-eslint/no-empty': 'off',
			'@typescript-eslint/ban-ts-comment': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-extraneous-class': 'off',
			'@typescript-eslint/no-useless-constructor': 'off',
			'no-unused-private-class-members': 'off'
			}
		},

		{
			files: ['**/*.ts', '**/*.tsx'],
			plugins: { local: plugin },
			rules: {
				'local/explicit-typing': 'warn',
				'local/require-braces': 'warn'
			}
		}
);