/**
 * Utility functions module
 * Common helper functions used across the application
 */

/**
 * Measures the execution time of an async function
 * @param fn - Function to measure
 * @param label - Label for logging
 * @returns Result of the function
 */
export async function measureTime<T>(fn: () => Promise<T>, label: string): Promise<T> {
	const startTime = Date.now();
	try {
		const result = await fn();
		const duration = Date.now() - startTime;
		console.log(`${label} completed in ${duration}ms`);
		return result;
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(`${label} failed after ${duration}ms:`, error);
		throw error;
	}
}

/**
 * Creates a structured error log entry
 * @param error - The error to log
 * @param context - Additional context information
 */
export function logError(error: unknown, context: Record<string, unknown> = {}): void {
	const errorDetails = {
		timestamp: new Date().toISOString(),
		error:
			error instanceof Error
				? {
						message: error.message,
						stack: error.stack,
						name: error.name,
					}
				: String(error),
		context,
	};

	console.error('Error occurred:', JSON.stringify(errorDetails, null, 2));
}

/**
 * Validates environment configuration
 * @param env - Environment object
 * @returns Validation result with any missing variables
 */
export function validateEnvironment(env: Env): {
	valid: boolean;
	missing: string[];
} {
	const missing: string[] = [];

	// Check required secrets
	if (!env.TELEGRAM_BOT_TOKEN) {
		missing.push('TELEGRAM_BOT_TOKEN');
	}

	// Check required environment variables
	if (!env.TELEGRAM_CHAT_ID) {
		missing.push('TELEGRAM_CHAT_ID');
	}

	// Check KV namespace binding
	if (!env.VERSION_STORAGE) {
		missing.push('VERSION_STORAGE (KV namespace binding)');
	}

	// GITHUB_CHANGELOG_URL has a default, so it's optional

	return {
		valid: missing.length === 0,
		missing,
	};
}

/**
 * Safely extracts error message from unknown error type
 * @param error - The error to extract message from
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
