import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		isolate: false,
		globals: true,
		fileParallelism: false,
		environment: 'node',
		reporters: [ 'default' ],
		slowTestThreshold: 1000,
		maxWorkers: 4,
		include: [ 'tests/**/*.test.ts' ],
	},
});