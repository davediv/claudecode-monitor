/**
 * Enhanced logging and error handling module
 * Provides structured logging with context and error tracking
 */

import type { ExecutionContext } from './types';
import { WorkerError } from './types';
import { ErrorCode } from './types/models';

/**
 * Log levels for structured logging
 */
export enum LogLevel {
	DEBUG = 'DEBUG',
	INFO = 'INFO',
	WARN = 'WARN',
	ERROR = 'ERROR',
	CRITICAL = 'CRITICAL',
}

/**
 * Log entry structure
 */
export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	context?: Record<string, unknown>;
	error?: {
		message: string;
		code?: string;
		stack?: string;
		details?: unknown;
	};
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
	/** Minimum log level to output */
	minLevel?: LogLevel;
	/** Whether to include stack traces */
	includeStackTrace?: boolean;
	/** Whether to output as JSON */
	jsonOutput?: boolean;
	/** Optional execution context for async operations */
	executionContext?: ExecutionContext;
}

/**
 * Global logger instance configuration
 */
let globalConfig: LoggerConfig = {
	minLevel: LogLevel.INFO,
	includeStackTrace: true,
	jsonOutput: true,
};

/**
 * Configure the global logger
 * @param config - Logger configuration
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
	globalConfig = { ...globalConfig, ...config };
}

/**
 * Get numeric value for log level comparison
 */
function getLevelValue(level: LogLevel): number {
	const levels = {
		[LogLevel.DEBUG]: 10,
		[LogLevel.INFO]: 20,
		[LogLevel.WARN]: 30,
		[LogLevel.ERROR]: 40,
		[LogLevel.CRITICAL]: 50,
	};
	return levels[level] || 0;
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
	const minLevelValue = getLevelValue(globalConfig.minLevel || LogLevel.INFO);
	const currentLevelValue = getLevelValue(level);
	return currentLevelValue >= minLevelValue;
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
	if (globalConfig.jsonOutput) {
		return JSON.stringify(entry, null, 2);
	}

	// Human-readable format
	let output = `[${entry.timestamp}] ${entry.level}: ${entry.message}`;

	if (entry.context && Object.keys(entry.context).length > 0) {
		output += `\nContext: ${JSON.stringify(entry.context, null, 2)}`;
	}

	if (entry.error) {
		output += `\nError: ${entry.error.message}`;
		if (entry.error.code) {
			output += ` (Code: ${entry.error.code})`;
		}
		if (entry.error.stack && globalConfig.includeStackTrace) {
			output += `\nStack: ${entry.error.stack}`;
		}
		if (entry.error.details) {
			output += `\nDetails: ${JSON.stringify(entry.error.details, null, 2)}`;
		}
	}

	return output;
}

/**
 * Core logging function
 */
function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
	if (!shouldLog(level)) {
		return;
	}

	const entry: LogEntry = {
		timestamp: new Date().toISOString(),
		level,
		message,
		context,
	};

	const formattedEntry = formatLogEntry(entry);

	// Route to appropriate console method
	switch (level) {
		case LogLevel.DEBUG:
			console.log(formattedEntry);
			break;
		case LogLevel.INFO:
			console.log(formattedEntry);
			break;
		case LogLevel.WARN:
			console.warn(formattedEntry);
			break;
		case LogLevel.ERROR:
			console.error(formattedEntry);
			break;
		case LogLevel.CRITICAL:
			console.error(formattedEntry);
			break;
	}
}

/**
 * Log error with structured format
 */
export function logError(error: unknown, context?: Record<string, unknown>): void {
	if (!shouldLog(LogLevel.ERROR)) {
		return;
	}

	const entry: LogEntry = {
		timestamp: new Date().toISOString(),
		level: LogLevel.ERROR,
		message: 'Error occurred',
		context,
		error: extractErrorInfo(error),
	};

	console.error(formatLogEntry(entry));
}

/**
 * Extract structured error information
 */
function extractErrorInfo(error: unknown): LogEntry['error'] {
	if (error instanceof WorkerError) {
		return {
			message: error.message,
			code: error.code,
			stack: globalConfig.includeStackTrace ? error.stack : undefined,
			details: error.details,
		};
	}

	if (error instanceof Error) {
		return {
			message: error.message,
			stack: globalConfig.includeStackTrace ? error.stack : undefined,
		};
	}

	return {
		message: String(error),
	};
}

/**
 * Logger instance with convenience methods
 */
export const logger = {
	debug: (message: string, context?: Record<string, unknown>) => log(LogLevel.DEBUG, message, context),
	info: (message: string, context?: Record<string, unknown>) => log(LogLevel.INFO, message, context),
	warn: (message: string, context?: Record<string, unknown>) => log(LogLevel.WARN, message, context),
	error: (message: string, context?: Record<string, unknown>) => log(LogLevel.ERROR, message, context),
	critical: (message: string, context?: Record<string, unknown>) => log(LogLevel.CRITICAL, message, context),
};

/**
 * Track operation with structured logging
 * @param operationName - Name of the operation
 * @param fn - Async function to execute
 * @param context - Additional context
 * @returns Result of the function
 */
export async function trackOperation<T>(operationName: string, fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T> {
	const startTime = Date.now();
	const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

	logger.debug(`Starting operation: ${operationName}`, {
		...context,
		operationId,
		startTime: new Date(startTime).toISOString(),
	});

	try {
		const result = await fn();
		const duration = Date.now() - startTime;

		logger.info(`Operation completed: ${operationName}`, {
			...context,
			operationId,
			duration,
			success: true,
		});

		return result;
	} catch (error) {
		const duration = Date.now() - startTime;

		logError(error, {
			...context,
			operation: operationName,
			operationId,
			duration,
			success: false,
		});

		throw error;
	}
}

/**
 * Wrap a function with error handling and logging
 * @param fn - Function to wrap
 * @param errorMessage - Custom error message
 * @param errorCode - Error code to use
 * @returns Wrapped function
 */
export function withErrorHandling<T extends (...args: unknown[]) => unknown>(fn: T, errorMessage: string, errorCode: ErrorCode): T {
	return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
		try {
			return await fn(...args) as ReturnType<T>;
		} catch (error) {
			logError(error, {
				function: fn.name || 'anonymous',
				args: args.length > 0 ? args : undefined,
			});

			if (error instanceof WorkerError) {
				throw error;
			}

			throw new WorkerError(`${errorMessage}: ${error instanceof Error ? error.message : String(error)}`, errorCode.toString(), {
				originalError: error,
			});
		}
	}) as T;
}

/**
 * Create a context-aware logger
 * @param baseContext - Base context to include in all logs
 * @returns Logger instance with context
 */
export function createContextLogger(baseContext: Record<string, unknown>): {
	debug: (message: string, context?: Record<string, unknown>) => void;
	info: (message: string, context?: Record<string, unknown>) => void;
	warn: (message: string, context?: Record<string, unknown>) => void;
	error: (message: string, context?: Record<string, unknown>) => void;
	critical: (message: string, context?: Record<string, unknown>) => void;
} {
	return {
		debug: (message: string, context?: Record<string, unknown>) => logger.debug(message, { ...baseContext, ...context }),
		info: (message: string, context?: Record<string, unknown>) => logger.info(message, { ...baseContext, ...context }),
		warn: (message: string, context?: Record<string, unknown>) => logger.warn(message, { ...baseContext, ...context }),
		error: (message: string, context?: Record<string, unknown>) => logger.error(message, { ...baseContext, ...context }),
		critical: (message: string, context?: Record<string, unknown>) => logger.critical(message, { ...baseContext, ...context }),
	};
}

/**
 * Error recovery strategies
 */
export interface ErrorRecoveryStrategy {
	/** Whether to retry the operation */
	shouldRetry: (error: unknown, attempt: number) => boolean;
	/** Delay before retry in milliseconds */
	getRetryDelay: (attempt: number) => number;
	/** Maximum number of retry attempts */
	maxAttempts: number;
}

/**
 * Default error recovery strategy
 */
export const defaultRecoveryStrategy: ErrorRecoveryStrategy = {
	shouldRetry: (error: unknown, attempt: number) => {
		// Don't retry on config or validation errors
		if (error instanceof WorkerError) {
			const nonRetryableCodes = [
				ErrorCode.CONFIG_ERROR.toString(),
				ErrorCode.VALIDATION_ERROR.toString(),
				ErrorCode.PARSE_ERROR.toString(),
			];
			return !nonRetryableCodes.includes(error.code);
		}
		return attempt < 3;
	},
	getRetryDelay: (attempt: number) => Math.min(Math.pow(2, attempt) * 1000, 10000),
	maxAttempts: 3,
};

/**
 * Execute function with retry logic
 * @param fn - Function to execute
 * @param strategy - Recovery strategy
 * @param context - Additional context for logging
 * @returns Result of the function
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	strategy: ErrorRecoveryStrategy = defaultRecoveryStrategy,
	context?: Record<string, unknown>,
): Promise<T> {
	let lastError: unknown;

	for (let attempt = 0; attempt < strategy.maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			if (strategy.shouldRetry(error, attempt)) {
				const delay = strategy.getRetryDelay(attempt);
				logger.warn(`Operation failed, retrying in ${delay}ms`, {
					...context,
					attempt: attempt + 1,
					maxAttempts: strategy.maxAttempts,
					error: extractErrorInfo(error),
				});
				await new Promise((resolve) => setTimeout(resolve, delay));
			} else {
				break;
			}
		}
	}

	throw lastError;
}

/**
 * Ensure sensitive data is not logged
 * @param data - Data to sanitize
 * @param sensitiveKeys - Keys to redact
 * @returns Sanitized data
 */
export function sanitizeForLogging(
	data: Record<string, unknown>,
	sensitiveKeys: string[] = ['token', 'password', 'secret', 'key', 'authorization'],
): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(data)) {
		const lowerKey = key.toLowerCase();
		const isSensitive = sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive));

		if (isSensitive) {
			sanitized[key] = '[REDACTED]';
		} else if (value && typeof value === 'object' && !Array.isArray(value)) {
			sanitized[key] = sanitizeForLogging(value as Record<string, unknown>, sensitiveKeys);
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
}
