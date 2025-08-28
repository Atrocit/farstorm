const config = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	verbose: true,
	testPathIgnorePatterns: [
		"build",
	],
	transform: {
		'^.+\\.ts$': [
			'ts-jest',
			{
				tsconfig: 'tsconfig.json',
				useESM: true,
			},
		],
	},
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	extensionsToTreatAsEsm: [ '.ts' ],
	maxWorkers: 1,
};

export default config;