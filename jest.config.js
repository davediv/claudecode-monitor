/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src', '<rootDir>/tests'],
	testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
	transform: {
		'^.+\\.ts$': 'ts-jest',
	},
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.d.ts',
		'!src/types/**',
		'!src/index.ts', // Exclude main entry point
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
	},
	globals: {
		'ts-jest': {
			tsconfig: {
				// Override some TypeScript settings for tests
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
			},
		},
	},
	// Setup files
	setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
	// Ignore patterns
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
	// Verbose output
	verbose: true,
};