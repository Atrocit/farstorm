import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		isolate: false,
		globals: true,
		fileParallelism: false,
		environment: 'node',
		reporters: [ 'default' ],
		coverage: {
			provider: 'v8',
			include: [ 'src/**/*.ts' ],
			exclude: [
				'src/drivers/Driver.ts',
				'src/types/**/*.ts',
				'src/util/types.ts',
			],
			reporter: [ 'text', 'html', 'cobertura' ],
			reportsDirectory: 'coverage',
		},
		slowTestThreshold: 1000,
		maxWorkers: 4,
		include: [ 'tests/**/*.test.ts' ],
	},
});
