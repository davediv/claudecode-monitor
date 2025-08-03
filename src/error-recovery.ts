/**
 * Error recovery and resilience module
 * Implements specific error handling strategies for different error scenarios
 */

import { WorkerError } from './types';
import { ErrorCode } from './types/models';
import { logger, withRetry } from './logging';

/**
 * Error recovery context
 */
export interface RecoveryContext {
	operation: string;
	attemptNumber: number;
	error: unknown;
	additionalContext?: Record<string, unknown>;
}

/**
 * Recovery action result
 */
export interface RecoveryResult<T = unknown> {
	success: boolean;
	recovered: boolean;
	result?: T;
	error?: unknown;
}

/**
 * Error-specific recovery strategies based on PRD requirements
 */
export const errorRecoveryStrategies = {
	/**
	 * ERR-001: GitHub unreachable/timeout
	 */
	githubUnreachable: {
		shouldRetry: (error: unknown, attempt: number): boolean => {
			if (attempt >= 3) return false;

			// Retry on network errors, timeouts, and 5xx errors
			if (error instanceof WorkerError && error.code === ErrorCode.FETCH_ERROR.toString()) {
				const details = error.details as { status?: number } | undefined;
				const status = details?.status;

				// Retry on network errors or server errors
				return !status || status >= 500;
			}

			return false;
		},
		getRetryDelay: (attempt: number): number => {
			// Progressive backoff: 5s, 10s, 20s
			return Math.min(5000 * Math.pow(2, attempt), 20000);
		},
		maxAttempts: 3,
	},

	/**
	 * ERR-002: Changelog parsing failure
	 */
	changelogParsing: {
		shouldRetry: (): boolean => false, // Don't retry parsing errors
		getRetryDelay: (): number => 0,
		maxAttempts: 1,
	},

	/**
	 * ERR-003: Telegram API errors
	 */
	telegramApi: {
		shouldRetry: (error: unknown, attempt: number): boolean => {
			if (attempt >= 3) return false;

			if (error instanceof WorkerError) {
				// Always retry rate limit errors
				if (error.code === ErrorCode.RATE_LIMIT_ERROR.toString()) {
					return true;
				}

				// Retry API errors except client errors (4xx)
				if (error.code === ErrorCode.API_ERROR.toString()) {
					const details = error.details as { status?: number } | undefined;
					const status = details?.status;

					// Don't retry client errors (400-499)
					if (status && status >= 400 && status < 500 && status !== 429) {
						return false;
					}

					return true;
				}
			}

			return false;
		},
		getRetryDelay: (attempt: number, error?: unknown): number => {
			// Check for rate limit retry-after
			if (error instanceof WorkerError && error.code === ErrorCode.RATE_LIMIT_ERROR.toString()) {
				const details = error.details as { retryAfter?: number } | undefined;
				if (details?.retryAfter) {
					return details.retryAfter * 1000;
				}
			}

			// Default exponential backoff
			return Math.min(Math.pow(2, attempt) * 1000, 10000);
		},
		maxAttempts: 3,
	},

	/**
	 * ERR-004: KV storage errors
	 */
	kvStorage: {
		shouldRetry: (error: unknown, attempt: number): boolean => {
			if (attempt >= 2) return false;

			// Retry on storage errors
			if (error instanceof WorkerError && error.code === ErrorCode.STORAGE_ERROR.toString()) {
				return true;
			}

			return false;
		},
		getRetryDelay: (attempt: number): number => {
			// Quick retry for KV: 1s, 2s
			return (attempt + 1) * 1000;
		},
		maxAttempts: 2,
	},
};

/**
 * Handle error with appropriate recovery strategy
 * @param error - The error to handle
 * @param context - Recovery context
 * @returns Recovery result
 */
export function handleErrorWithRecovery<T>(error: unknown, context: RecoveryContext): RecoveryResult<T> {
	logger.warn('Attempting error recovery', {
		operation: context.operation,
		attempt: context.attemptNumber,
		error: error instanceof Error ? error.message : String(error),
	});

	// Determine error type and apply appropriate strategy
	if (error instanceof WorkerError) {
		switch (error.code) {
			case ErrorCode.FETCH_ERROR.toString():
				return {
					success: false,
					recovered: false,
					error: new WorkerError('GitHub changelog is currently unavailable. Will retry on next scheduled run.', error.code, error.details),
				};

			case ErrorCode.PARSE_ERROR.toString():
				// Log critical error for parsing failures
				logger.critical('Changelog parsing failed - possible format change', {
					operation: context.operation,
					error: error.message,
					details: error.details,
				});

				return {
					success: false,
					recovered: false,
					error: new WorkerError('Unable to parse changelog format. Manual intervention may be required.', error.code, error.details),
				};

			case ErrorCode.API_ERROR.toString():
			case ErrorCode.RATE_LIMIT_ERROR.toString():
				// These are handled by retry logic
				return {
					success: false,
					recovered: false,
					error,
				};

			case ErrorCode.STORAGE_ERROR.toString():
				logger.error('KV storage error - state may be inconsistent', {
					operation: context.operation,
					error: error.message,
				});

				return {
					success: false,
					recovered: false,
					error,
				};

			case ErrorCode.CONFIG_ERROR.toString():
				// Configuration errors are critical and non-recoverable
				logger.critical('Configuration error - worker cannot function', {
					operation: context.operation,
					error: error.message,
					details: error.details,
				});

				return {
					success: false,
					recovered: false,
					error,
				};

			default:
				// Unknown error code
				return {
					success: false,
					recovered: false,
					error,
				};
		}
	}

	// Non-WorkerError errors
	return {
		success: false,
		recovered: false,
		error,
	};
}

/**
 * Create a resilient wrapper for operations
 * @param operation - Operation name
 * @param fn - Function to execute
 * @param recoveryStrategy - Optional custom recovery strategy
 * @returns Wrapped function with error recovery
 */
export function makeResilient<T extends (...args: unknown[]) => Promise<unknown>>(
	operation: string,
	fn: T,
	recoveryStrategy?: (typeof errorRecoveryStrategies)[keyof typeof errorRecoveryStrategies],
): T {
	return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
		const strategy = recoveryStrategy || {
			shouldRetry: (error: unknown, attempt: number) => {
				// Determine strategy based on error type
				if (error instanceof WorkerError) {
					switch (error.code) {
						case ErrorCode.FETCH_ERROR.toString():
							return errorRecoveryStrategies.githubUnreachable.shouldRetry(error, attempt);
						case ErrorCode.API_ERROR.toString():
						case ErrorCode.RATE_LIMIT_ERROR.toString():
							return errorRecoveryStrategies.telegramApi.shouldRetry(error, attempt);
						case ErrorCode.STORAGE_ERROR.toString():
							return errorRecoveryStrategies.kvStorage.shouldRetry(error, attempt);
						default:
							return false;
					}
				}
				return false;
			},
			getRetryDelay: (attempt: number, error?: unknown) => {
				if (error instanceof WorkerError) {
					switch (error.code) {
						case ErrorCode.FETCH_ERROR.toString():
							return errorRecoveryStrategies.githubUnreachable.getRetryDelay(attempt);
						case ErrorCode.API_ERROR.toString():
						case ErrorCode.RATE_LIMIT_ERROR.toString():
							return errorRecoveryStrategies.telegramApi.getRetryDelay(attempt, error);
						case ErrorCode.STORAGE_ERROR.toString():
							return errorRecoveryStrategies.kvStorage.getRetryDelay(attempt);
						default:
							return 1000;
					}
				}
				return 1000;
			},
			maxAttempts: 3,
		};

		try {
			return await withRetry(() => fn(...args), strategy, { operation, args: args.length > 0 ? args : undefined }) as ReturnType<T>;
		} catch (error) {
			// Final error after all retries
			const recoveryResult = handleErrorWithRecovery(error, {
				operation,
				attemptNumber: strategy.maxAttempts,
				error,
			});

			throw recoveryResult.error || error;
		}
	}) as T;
}

/**
 * Circuit breaker for preventing cascading failures
 */
export class CircuitBreaker {
	private failures = 0;
	private lastFailureTime = 0;
	private state: 'closed' | 'open' | 'half-open' = 'closed';

	constructor(
		private readonly threshold: number = 5,
		private readonly timeout: number = 60000, // 1 minute
		private readonly operation: string,
	) {}

	/**
	 * Execute function with circuit breaker protection
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		if (this.state === 'open') {
			const now = Date.now();
			if (now - this.lastFailureTime >= this.timeout) {
				this.state = 'half-open';
				logger.info(`Circuit breaker half-open for ${this.operation}`);
			} else {
				throw new WorkerError(`Circuit breaker is open for ${this.operation}. Too many failures.`, ErrorCode.UNKNOWN_ERROR.toString(), {
					failures: this.failures,
				});
			}
		}

		try {
			const result = await fn();

			if (this.state === 'half-open') {
				this.state = 'closed';
				this.failures = 0;
				logger.info(`Circuit breaker closed for ${this.operation}`);
			}

			return result;
		} catch (error) {
			this.failures++;
			this.lastFailureTime = Date.now();

			if (this.failures >= this.threshold) {
				this.state = 'open';
				logger.error(`Circuit breaker opened for ${this.operation}`, {
					failures: this.failures,
					threshold: this.threshold,
				});
			}

			throw error;
		}
	}

	/**
	 * Reset the circuit breaker
	 */
	reset(): void {
		this.failures = 0;
		this.lastFailureTime = 0;
		this.state = 'closed';
		logger.info(`Circuit breaker reset for ${this.operation}`);
	}
}

/**
 * Global circuit breakers for critical operations
 */
export const circuitBreakers = {
	github: new CircuitBreaker(5, 60000, 'GitHub API'),
	telegram: new CircuitBreaker(10, 30000, 'Telegram API'),
	storage: new CircuitBreaker(3, 10000, 'KV Storage'),
};

/**
 * Health check for error recovery systems
 */
export function getErrorRecoveryHealth(): Record<string, unknown> {
	return {
		circuitBreakers: {
			github: {
				state: circuitBreakers.github['state'],
				failures: circuitBreakers.github['failures'],
			},
			telegram: {
				state: circuitBreakers.telegram['state'],
				failures: circuitBreakers.telegram['failures'],
			},
			storage: {
				state: circuitBreakers.storage['state'],
				failures: circuitBreakers.storage['failures'],
			},
		},
	};
}
