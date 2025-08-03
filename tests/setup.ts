/**
 * Jest test setup file
 * Configures the test environment before each test suite
 */

// Mock global objects that are available in Cloudflare Workers
global.KVNamespace = class KVNamespace {
	async get(key: string): Promise<string | null> {
		return null;
	}
	
	async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
		// Mock implementation
	}
	
	async delete(key: string): Promise<void> {
		// Mock implementation
	}
} as any;

// Mock fetch for tests
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests
global.console = {
	...console,
	log: jest.fn(),
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
};

// Reset mocks before each test
beforeEach(() => {
	jest.clearAllMocks();
});