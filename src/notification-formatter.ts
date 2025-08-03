/**
 * Notification formatter module
 * Handles formatting of messages for various notification channels
 */

import type { Version, TelegramMessage } from './types/models';
import { ErrorCode } from './types/models';
import { WorkerError } from './types/index';

/**
 * Configuration options for message formatting
 */
export interface FormatOptions {
	/** Maximum number of changes to display */
	maxChanges?: number;
	/** Include emoji in the message */
	includeEmoji?: boolean;
	/** Date format locale */
	dateLocale?: string;
	/** Custom date format options */
	dateFormatOptions?: Intl.DateTimeFormatOptions;
	/** Escape markdown special characters */
	escapeMarkdown?: boolean;
}

/**
 * Default formatting options
 */
const DEFAULT_FORMAT_OPTIONS: Required<FormatOptions> = {
	maxChanges: 10,
	includeEmoji: true,
	dateLocale: 'en-US',
	dateFormatOptions: {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	},
	escapeMarkdown: true,
};

/**
 * Escapes markdown special characters for Telegram
 * @param text - Text to escape
 * @returns Escaped text
 */
export function escapeMarkdown(text: string): string {
	// Telegram legacy Markdown special characters (only _, *, `, [)
	return text.replace(/[_*`[]/g, '\\$&');
}

/**
 * Formats a date string into a human-readable format
 * @param dateString - ISO date string or 'Unknown'
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatDate(dateString: string | undefined, options: Pick<FormatOptions, 'dateLocale' | 'dateFormatOptions'> = {}): string {
	const { dateLocale, dateFormatOptions } = {
		...DEFAULT_FORMAT_OPTIONS,
		...options,
	};

	if (!dateString || dateString === 'Unknown') {
		return 'Unknown';
	}

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) {
			return 'Unknown';
		}
		return date.toLocaleDateString(dateLocale, dateFormatOptions);
	} catch {
		return 'Unknown';
	}
}

/**
 * Formats a list of changes with proper bullets and markdown
 * @param changes - Array of change strings
 * @param options - Formatting options
 * @returns Formatted changes string
 */
export function formatChanges(changes: string[], options: Pick<FormatOptions, 'maxChanges' | 'escapeMarkdown'> = {}): string {
	const { maxChanges, escapeMarkdown: shouldEscape } = {
		...DEFAULT_FORMAT_OPTIONS,
		...options,
	};

	if (!changes || !Array.isArray(changes) || changes.length === 0) {
		return 'No changes listed';
	}

	const formattedChanges = changes
		.slice(0, maxChanges)
		.map((change) => {
			// Remove existing bullet points and clean up
			const cleaned = change.replace(/^[-*•]\s*/, '').trim();
			const text = shouldEscape ? escapeMarkdown(cleaned) : cleaned;
			return `• ${text}`;
		})
		.join('\n');

	const moreText = changes.length > maxChanges ? (shouldEscape ? '\n_\\.\\.\\.\\. and more_' : '\n_... and more_') : '';

	return formattedChanges + moreText;
}

/**
 * Creates a TelegramMessage from a Version object
 * @param version - Version data
 * @param changelogUrl - URL to the full changelog
 * @returns TelegramMessage object
 */
export function createTelegramMessage(version: Version, changelogUrl: string): TelegramMessage {
	if (!version || !version.version) {
		throw new WorkerError('Invalid version data for message creation', ErrorCode.VALIDATION_ERROR, { version });
	}

	return {
		version: version.version,
		date: version.date,
		changes: version.changes || [],
		changelogUrl,
	};
}

/**
 * Formats a notification message for Telegram
 * @param message - Message data
 * @param options - Formatting options
 * @returns Formatted message string
 */
export function formatTelegramNotification(message: TelegramMessage, options: FormatOptions = {}): string {
	const opts = { ...DEFAULT_FORMAT_OPTIONS, ...options };

	// Validate message
	if (!message || !message.version) {
		throw new WorkerError('Invalid message data', ErrorCode.VALIDATION_ERROR, { message });
	}

	const emoji = opts.includeEmoji ? '🚀 ' : '';
	const versionText = opts.escapeMarkdown ? escapeMarkdown(message.version) : message.version;

	const formattedDate = formatDate(message.date, {
		dateLocale: opts.dateLocale,
		dateFormatOptions: opts.dateFormatOptions,
	});

	const changesList = formatChanges(message.changes, {
		maxChanges: opts.maxChanges,
		escapeMarkdown: opts.escapeMarkdown,
	});

	// Build the message according to PRD specification
	const titleLine = `${emoji}*New Claude Code Release!*`;

	return `${titleLine}

Version: *v${versionText}*
Released: ${formattedDate}

*What's New:*
${changesList}

Full changelog: [View on GitHub](${message.changelogUrl})`;
}

/**
 * Formats a notification for different platforms
 * @param message - Message data
 * @param platform - Target platform ('telegram', 'slack', 'discord', etc.)
 * @param options - Platform-specific formatting options
 * @returns Formatted message string
 */
export function formatNotification(
	message: TelegramMessage,
	platform: 'telegram' | 'slack' | 'discord' | 'plain' = 'telegram',
	options: FormatOptions = {},
): string {
	switch (platform) {
		case 'telegram':
			return formatTelegramNotification(message, options);

		case 'plain':
			// Plain text format without markdown
			return formatTelegramNotification(message, {
				...options,
				escapeMarkdown: false,
			}).replace(/\*/g, ''); // Remove markdown emphasis

		case 'slack':
		case 'discord':
			// Future enhancement: Add platform-specific formatting
			throw new WorkerError(`Platform ${platform} not yet implemented`, ErrorCode.VALIDATION_ERROR);

		default:
			throw new WorkerError(`Unknown platform: ${platform as string}`, ErrorCode.VALIDATION_ERROR);
	}
}
