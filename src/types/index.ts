/**
 * Type definitions for Claude Code Monitor
 * This file provides proper TypeScript types for the Cloudflare Worker environment
 */

/// <reference types="../../worker-configuration" />

/**
 * Cloudflare Worker Event Types
 */
export interface ScheduledEvent {
	cron: string;
	scheduledTime: number;
}

export interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
	passThroughOnException(): void;
}

/**
 * Worker Handler Types
 */
export interface ExportedHandler<Env = unknown> {
	fetch?: (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;
	scheduled?: (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => void | Promise<void>;
	trace?: (traces: TraceItem[], env: Env, ctx: ExecutionContext) => void | Promise<void>;
	tail?: (events: TailEvent[], env: Env, ctx: ExecutionContext) => void | Promise<void>;
}

export interface TraceItem {
	event: FetchEvent | ScheduledEvent | undefined;
	eventTimestamp?: number;
	logs: TraceLog[];
	exceptions: TraceException[];
	scriptName?: string;
	outcome: string;
}

export interface TraceLog {
	timestamp: number;
	level: string;
	message: object;
}

export interface TraceException {
	timestamp: number;
	message: string;
	name: string;
}

export type TailEvent = Record<string, unknown>;

/**
 * Application-specific types
 */
export interface AppConfig {
	githubChangelogUrl: string;
	telegramChatId: string;
	telegramBotToken: string;
	versionStorage: KVNamespace;
}

/**
 * Error types
 */
export class WorkerError extends Error {
	constructor(
		message: string,
		public code: string,
		public details?: unknown,
	) {
		super(message);
		this.name = 'WorkerError';
	}
}

// Re-export all data models
export * from './models';
