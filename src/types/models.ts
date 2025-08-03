/**
 * Data model interfaces for Claude Code Monitor
 * This file contains all the data structures used throughout the application
 */

/**
 * Represents a version entry from the changelog
 */
export interface Version {
	/** Semantic version string (e.g., "1.2.3") */
	version: string;
	/** Release date in YYYY-MM-DD format */
	date: string;
	/** List of changes/features in this version */
	changes: string[];
}

/**
 * Parsed changelog data structure
 */
export interface ChangelogData {
	/** All versions found in the changelog */
	versions: Version[];
	/** The most recent version (first in the list) */
	latestVersion: Version | null;
}

/**
 * State stored in Cloudflare KV
 * Matches the PRD schema specification
 */
export interface StorageState {
	/** Last known version number */
	lastVersion: string;
	/** ISO timestamp of last check */
	lastCheckTime: string;
	/** ISO timestamp of last notification sent (optional) */
	lastNotificationTime?: string;
}

/**
 * Configuration for Telegram bot
 */
export interface TelegramConfig {
	/** Bot authentication token */
	botToken: string;
	/** Target chat/channel ID */
	chatId: string;
	/** Optional thread/topic ID for sending to specific topics in supergroups */
	threadId?: string;
}

/**
 * Message data structure for Telegram notifications
 */
export interface TelegramMessage {
	/** Version number (without 'v' prefix) */
	version: string;
	/** Release date in YYYY-MM-DD format */
	date: string;
	/** List of changes to include in the message */
	changes: string[];
	/** URL to the full changelog */
	changelogUrl: string;
}

/**
 * Result of a version check operation
 */
export interface VersionCheckResult {
	/** Whether a new version was found */
	hasNewVersion: boolean;
	/** The latest version from the changelog */
	latestVersion: Version | null;
	/** The previous version from storage */
	previousVersion: string | null;
	/** Any error that occurred during checking */
	error?: string;
}

/**
 * Application metrics for monitoring
 */
export interface PerformanceMetrics {
	/** Time taken to fetch changelog in ms */
	fetchDuration?: number;
	/** Time taken to parse changelog in ms */
	parseDuration?: number;
	/** Time taken for KV operations in ms */
	storageDuration?: number;
	/** Time taken to send notification in ms */
	notificationDuration?: number;
	/** Total execution time in ms */
	totalDuration: number;
}

/**
 * Error codes used throughout the application
 */
export enum ErrorCode {
	FETCH_ERROR = 'FETCH_ERROR',
	PARSE_ERROR = 'PARSE_ERROR',
	STORAGE_ERROR = 'STORAGE_ERROR',
	NOTIFICATION_ERROR = 'NOTIFICATION_ERROR',
	CONFIG_ERROR = 'CONFIG_ERROR',
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	API_ERROR = 'API_ERROR',
	RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
	UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Standardized error response
 */
export interface ErrorResponse {
	/** Error code for categorization */
	code: ErrorCode;
	/** Human-readable error message */
	message: string;
	/** Additional error details */
	details?: unknown;
	/** ISO timestamp when error occurred */
	timestamp: string;
}
