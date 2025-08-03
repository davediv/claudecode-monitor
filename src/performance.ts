/**
 * Performance monitoring module
 * Tracks execution times, resource usage, and performance metrics
 */

import { logger } from './logging';

/**
 * Performance metric types
 */
export interface PerformanceMetric {
	operation: string;
	duration: number;
	timestamp: string;
	success: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * Performance thresholds
 */
export interface PerformanceThresholds {
	/** Maximum execution time in ms (excluding API calls) */
	maxExecutionTime: number;
	/** Warning threshold as percentage of max */
	warningThreshold: number;
	/** Critical threshold as percentage of max */
	criticalThreshold: number;
}

/**
 * Performance summary
 */
export interface PerformanceSummary {
	totalDuration: number;
	operationBreakdown: Record<string, number>;
	apiCallDuration: number;
	internalProcessingDuration: number;
	meetsPerformanceTarget: boolean;
	warnings: string[];
}

/**
 * Default performance thresholds based on PRD
 */
export const DEFAULT_THRESHOLDS: PerformanceThresholds = {
	maxExecutionTime: 50, // 50ms as per NFR-001
	warningThreshold: 0.8, // Warn at 80% of max
	criticalThreshold: 0.95, // Critical at 95% of max
};

/**
 * Performance collector for tracking metrics
 */
export class PerformanceCollector {
	private metrics: PerformanceMetric[] = [];
	private operationStack: Array<{ name: string; startTime: number }> = [];
	private apiCallDuration = 0;
	private thresholds: PerformanceThresholds;

	constructor(thresholds: PerformanceThresholds = DEFAULT_THRESHOLDS) {
		this.thresholds = thresholds;
	}

	/**
	 * Start tracking an operation
	 * @param operationName - Name of the operation
	 * @returns Operation ID
	 */
	startOperation(operationName: string): string {
		const startTime = Date.now();
		this.operationStack.push({ name: operationName, startTime });

		logger.debug(`Performance: Starting ${operationName}`, {
			stackDepth: this.operationStack.length,
			timestamp: new Date(startTime).toISOString(),
		});

		return `${operationName}-${startTime}`;
	}

	/**
	 * End tracking an operation
	 * @param operationName - Name of the operation
	 * @param success - Whether the operation succeeded
	 * @param metadata - Additional metadata
	 */
	endOperation(operationName: string, success = true, metadata?: Record<string, unknown>): void {
		const endTime = Date.now();
		let operationIndex = -1;
		for (let i = this.operationStack.length - 1; i >= 0; i--) {
			if (this.operationStack[i].name === operationName) {
				operationIndex = i;
				break;
			}
		}

		if (operationIndex === -1) {
			logger.warn(`Performance: Ending untracked operation ${operationName}`);
			return;
		}

		const operation = this.operationStack[operationIndex];
		this.operationStack.splice(operationIndex, 1);

		const duration = endTime - operation.startTime;
		const metric: PerformanceMetric = {
			operation: operationName,
			duration,
			timestamp: new Date(endTime).toISOString(),
			success,
			metadata,
		};

		this.metrics.push(metric);

		// Check if this is an API call
		if (operationName.includes('api') || operationName.includes('fetch') || operationName.includes('telegram')) {
			this.apiCallDuration += duration;
		}

		// Log performance based on thresholds
		const level = this.getPerformanceLevel(duration, this.isApiCall(operationName));
		const logMessage = `Performance: ${operationName} completed in ${duration}ms`;

		switch (level) {
			case 'critical':
				logger.critical(logMessage, { duration, success, metadata });
				break;
			case 'warning':
				logger.warn(logMessage, { duration, success, metadata });
				break;
			default:
				logger.debug(logMessage, { duration, success, metadata });
		}
	}

	/**
	 * Track an async operation
	 * @param operationName - Name of the operation
	 * @param fn - Async function to execute
	 * @param metadata - Additional metadata
	 * @returns Result of the function
	 */
	async track<T>(operationName: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T> {
		this.startOperation(operationName);

		try {
			const result = await fn();
			this.endOperation(operationName, true, metadata);
			return result;
		} catch (error) {
			this.endOperation(operationName, false, { ...metadata, error: String(error) });
			throw error;
		}
	}

	/**
	 * Get performance summary
	 * @returns Performance summary
	 */
	getSummary(): PerformanceSummary {
		const totalDuration = this.metrics.reduce((sum, metric) => sum + metric.duration, 0);
		const internalProcessingDuration = totalDuration - this.apiCallDuration;

		// Group metrics by operation
		const operationBreakdown: Record<string, number> = {};
		for (const metric of this.metrics) {
			operationBreakdown[metric.operation] = (operationBreakdown[metric.operation] || 0) + metric.duration;
		}

		// Check performance targets
		const warnings: string[] = [];
		const meetsPerformanceTarget = internalProcessingDuration <= this.thresholds.maxExecutionTime;

		if (!meetsPerformanceTarget) {
			warnings.push(`Internal processing time (${internalProcessingDuration}ms) exceeds target (${this.thresholds.maxExecutionTime}ms)`);
		}

		// Check individual operations
		for (const [operation, duration] of Object.entries(operationBreakdown)) {
			if (!this.isApiCall(operation)) {
				const level = this.getPerformanceLevel(duration, false);
				if (level === 'warning' || level === 'critical') {
					warnings.push(`Operation '${operation}' took ${duration}ms`);
				}
			}
		}

		return {
			totalDuration,
			operationBreakdown,
			apiCallDuration: this.apiCallDuration,
			internalProcessingDuration,
			meetsPerformanceTarget,
			warnings,
		};
	}

	/**
	 * Get all collected metrics
	 * @returns Array of performance metrics
	 */
	getMetrics(): PerformanceMetric[] {
		return [...this.metrics];
	}

	/**
	 * Reset the collector
	 */
	reset(): void {
		this.metrics = [];
		this.operationStack = [];
		this.apiCallDuration = 0;
	}

	/**
	 * Check if an operation is an API call
	 * @param operationName - Name of the operation
	 * @returns true if API call
	 */
	private isApiCall(operationName: string): boolean {
		const apiPatterns = ['api', 'fetch', 'telegram', 'github', 'http', 'request'];
		return apiPatterns.some((pattern) => operationName.toLowerCase().includes(pattern));
	}

	/**
	 * Get performance level based on duration
	 * @param duration - Duration in ms
	 * @param isApiCall - Whether this is an API call
	 * @returns Performance level
	 */
	private getPerformanceLevel(duration: number, isApiCall: boolean): 'normal' | 'warning' | 'critical' {
		if (isApiCall) {
			// More lenient for API calls
			if (duration > 5000) return 'critical';
			if (duration > 2000) return 'warning';
			return 'normal';
		}

		const warningThreshold = this.thresholds.maxExecutionTime * this.thresholds.warningThreshold;
		const criticalThreshold = this.thresholds.maxExecutionTime * this.thresholds.criticalThreshold;

		if (duration > criticalThreshold) return 'critical';
		if (duration > warningThreshold) return 'warning';
		return 'normal';
	}
}

/**
 * Global performance collector instance
 */
let globalCollector: PerformanceCollector | null = null;

/**
 * Get or create the global performance collector
 * @param thresholds - Optional custom thresholds
 * @returns Performance collector instance
 */
export function getPerformanceCollector(thresholds?: PerformanceThresholds): PerformanceCollector {
	if (!globalCollector || thresholds) {
		globalCollector = new PerformanceCollector(thresholds);
	}
	return globalCollector;
}

/**
 * Enhanced performance tracking function
 * @param operationName - Name of the operation
 * @param fn - Async function to execute
 * @param metadata - Additional metadata
 * @returns Result of the function
 */
export async function trackPerformance<T>(operationName: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T> {
	const collector = getPerformanceCollector();
	return collector.track(operationName, fn, metadata);
}

/**
 * Performance monitoring middleware
 * @param env - Environment object
 * @returns Middleware function
 */
export function createPerformanceMiddleware(env: Env): {
	start: () => void;
	end: () => PerformanceSummary;
} {
	return {
		/**
		 * Start performance monitoring for a request
		 */
		start: () => {
			const collector = getPerformanceCollector();
			collector.reset();
			collector.startOperation('total_execution');
		},

		/**
		 * End performance monitoring and log summary
		 */
		end: () => {
			const collector = getPerformanceCollector();
			collector.endOperation('total_execution');

			const summary = collector.getSummary();

			// Log performance summary
			const logData = {
				totalDuration: summary.totalDuration,
				apiCallDuration: summary.apiCallDuration,
				internalProcessingDuration: summary.internalProcessingDuration,
				meetsTarget: summary.meetsPerformanceTarget,
				operationCount: Object.keys(summary.operationBreakdown).length,
			};

			if (summary.meetsPerformanceTarget) {
				logger.info('Performance target met', logData);
			} else {
				logger.warn('Performance target not met', {
					...logData,
					warnings: summary.warnings,
					breakdown: summary.operationBreakdown,
				});
			}

			// Store metrics for analysis if needed
			if (env.PERFORMANCE_ANALYTICS_ENABLED && (env.PERFORMANCE_ANALYTICS_ENABLED as string) === 'true') {
				void storePerformanceMetrics(env, collector.getMetrics(), summary);
			}

			return summary;
		},
	};
}

/**
 * Store performance metrics for analysis
 * @param env - Environment object
 * @param metrics - Performance metrics
 * @param summary - Performance summary
 */
async function storePerformanceMetrics(env: Env, metrics: PerformanceMetric[], summary: PerformanceSummary): Promise<void> {
	try {
		// Store in KV for analysis (with TTL)
		const key = `perf_${Date.now()}_${Math.random().toString(36).substring(7)}`;
		const data = {
			timestamp: new Date().toISOString(),
			metrics,
			summary,
		};

		// Store with 7-day TTL for performance data
		await env.VERSION_STORAGE.put(key, JSON.stringify(data), {
			expirationTtl: 604800, // 7 days
		});

		logger.debug('Performance metrics stored', { key });
	} catch (error) {
		logger.error('Failed to store performance metrics', {
			error: String(error),
		});
	}
}

/**
 * Get performance health status
 * @returns Health status object
 */
export function getPerformanceHealth(): Record<string, unknown> {
	const collector = getPerformanceCollector();
	const summary = collector.getSummary();

	return {
		meetsTarget: summary.meetsPerformanceTarget,
		totalDuration: summary.totalDuration,
		apiCallDuration: summary.apiCallDuration,
		internalProcessingDuration: summary.internalProcessingDuration,
		operationCount: Object.keys(summary.operationBreakdown).length,
		warnings: summary.warnings.length,
	};
}
