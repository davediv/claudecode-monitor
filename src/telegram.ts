/**
 * Telegram Bot API integration module
 * Handles sending notifications to Telegram groups
 */

import type { TelegramConfig, TelegramMessage } from './types/models';
import { ErrorCode } from './types/models';
import { WorkerError } from './types/index';
import { measureTime, logError } from './utils';

/**
 * Telegram API response types
 */
interface TelegramApiResponse {
	ok: boolean;
	result?: unknown;
	error_code?: number;
	description?: string;
	parameters?: {
		retry_after?: number;
	};
}

interface TelegramErrorDetails {
	raw?: string;
	error_code?: number;
	description?: string;
	parameters?: {
		retry_after?: number;
	};
}

/**
 * Rate limiting state
 */
const rateLimitState: { lastRequestTime: number; requestCount: number } = {
	lastRequestTime: 0,
	requestCount: 0,
};

/**
 * Validates Telegram configuration
 * @param config - Configuration to validate
 * @throws {WorkerError} If configuration is invalid
 */
function validateConfig(config: TelegramConfig): void {
	if (!config.botToken || typeof config.botToken !== 'string' || config.botToken.length < 10) {
		throw new WorkerError('Invalid Telegram bot token', ErrorCode.CONFIG_ERROR, { tokenLength: config.botToken?.length });
	}

	if (!config.chatId || typeof config.chatId !== 'string') {
		throw new WorkerError('Invalid Telegram chat ID', ErrorCode.CONFIG_ERROR, { chatId: config.chatId });
	}
}

/**
 * Implements rate limiting for Telegram API
 * Telegram allows 30 messages per second to different users
 * We'll be more conservative: max 20 requests per minute
 */
async function checkRateLimit(): Promise<void> {
	const now = Date.now();
	const minuteAgo = now - 60000;

	// Reset counter if more than a minute has passed
	if (rateLimitState.lastRequestTime < minuteAgo) {
		rateLimitState.requestCount = 0;
	}

	// Check if we're at the limit
	if (rateLimitState.requestCount >= 20) {
		const waitTime = 60000 - (now - rateLimitState.lastRequestTime);
		if (waitTime > 0) {
			console.log(`Rate limit reached, waiting ${waitTime}ms`);
			await new Promise((resolve) => setTimeout(resolve, waitTime));
			rateLimitState.requestCount = 0;
		}
	}

	rateLimitState.lastRequestTime = now;
	rateLimitState.requestCount++;
}

/**
 * Sends a message to Telegram using the Bot API
 * @param config - Telegram bot configuration
 * @param message - Message content
 * @param retries - Number of retry attempts (default: 3)
 * @throws {WorkerError} If sending fails after all retries
 */
export async function sendTelegramNotification(config: TelegramConfig, message: TelegramMessage, retries = 3): Promise<void> {
	// Validate inputs
	validateConfig(config);

	if (!message || !message.version) {
		throw new WorkerError('Invalid message data', ErrorCode.VALIDATION_ERROR, { message });
	}

	const formattedMessage = formatMessage(message);
	const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

	let lastError: unknown;

	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			// Check rate limit before making request
			await checkRateLimit();

			const response = await measureTime(
				async () =>
					fetch(url, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'User-Agent': 'claude-code-monitor/1.0',
						},
						body: JSON.stringify({
							chat_id: config.chatId,
							text: formattedMessage,
							parse_mode: 'Markdown',
							disable_web_page_preview: false,
						}),
					}),
				`Telegram API call (attempt ${attempt + 1})`,
			);

			if (!response.ok) {
				const errorData = await response.text();
				let errorDetails: TelegramErrorDetails;
				try {
					errorDetails = JSON.parse(errorData) as TelegramApiResponse;
				} catch {
					errorDetails = { raw: errorData };
				}

				// Handle specific Telegram errors
				if (response.status === 429) {
					// Rate limit from Telegram
					const retryAfter = errorDetails?.parameters?.retry_after || 60;
					throw new WorkerError(`Telegram rate limit: retry after ${retryAfter}s`, ErrorCode.RATE_LIMIT_ERROR, { retryAfter, attempt });
				}

				throw new WorkerError(`Telegram API error: ${response.status}`, ErrorCode.API_ERROR, {
					status: response.status,
					errorDetails,
					attempt,
				});
			}

			const result = await response.json();
			if (!result.ok) {
				throw new WorkerError('Telegram API returned ok=false', ErrorCode.API_ERROR, { result });
			}

			console.log(`Telegram notification sent successfully to chat ${config.chatId}`);
			return;
		} catch (error) {
			lastError = error;
			console.error(`Telegram notification attempt ${attempt + 1}/${retries} failed:`, error);

			// If not the last attempt, wait before retrying
			if (attempt < retries - 1) {
				let delay: number;

				// Check if error has specific retry delay (rate limit)
				if (error instanceof WorkerError && error.code === ErrorCode.RATE_LIMIT_ERROR.toString()) {
					const retryAfter = (error.details as { retryAfter?: number })?.retryAfter || 60;
					delay = retryAfter * 1000;
				} else {
					// Exponential backoff: 1s, 2s, 4s
					delay = Math.min(Math.pow(2, attempt) * 1000, 10000);
				}

				console.log(`Waiting ${delay}ms before retry...`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	// Log final error
	logError(lastError, {
		operation: 'sendTelegramNotification',
		chatId: config.chatId,
		messageVersion: message.version,
		retries,
	});

	// All retries failed
	if (lastError instanceof WorkerError) {
		throw lastError;
	}

	throw new WorkerError(`Failed to send Telegram notification after ${retries} attempts`, ErrorCode.API_ERROR, {
		originalError: lastError,
	});
}

/**
 * Formats the message for Telegram with markdown
 * @param message - Message data
 * @returns Formatted message string
 */
export function formatMessage(message: TelegramMessage): string {
	// Validate and sanitize inputs
	if (!message.changes || !Array.isArray(message.changes)) {
		message.changes = [];
	}

	// Escape markdown special characters in user content
	const escapeMarkdown = (text: string): string => {
		return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
	};

	const changesList = message.changes
		.slice(0, 10) // Limit to first 10 changes
		.map((change) => {
			// Remove leading bullet points and clean up
			const cleaned = change.replace(/^[-*•]\s*/, '').trim();
			return `• ${escapeMarkdown(cleaned)}`;
		})
		.join('\\n');

	// Format date to be more readable
	let formattedDate = 'Unknown';
	if (message.date && message.date !== 'Unknown') {
		try {
			const date = new Date(message.date);
			if (!isNaN(date.getTime())) {
				formattedDate = date.toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				});
			}
		} catch {
			// Keep 'Unknown' if date parsing fails
		}
	}

	return `🚀 *New Claude Code Release\\!*

Version: *v${escapeMarkdown(message.version)}*
Released: ${formattedDate}

*What's New:*
${changesList || 'No changes listed'}${message.changes.length > 10 ? '\\n_\\.\\.\\.\\. and more_' : ''}

Full changelog: [View on GitHub](${message.changelogUrl})`;
}

/**
 * Validates if a string is a valid Telegram chat ID
 * @param chatId - Chat ID to validate
 * @returns true if valid
 */
export function isValidChatId(chatId: string): boolean {
	// Telegram chat IDs can be:
	// - Positive numbers for users
	// - Negative numbers for groups
	// - Strings starting with @ for public channels
	return /^-?\d+$/.test(chatId) || /^@[a-zA-Z0-9_]{5,}$/.test(chatId);
}

/**
 * Gets the Telegram API URL for a specific bot method
 * @param botToken - Bot token
 * @param method - API method name
 * @returns Full API URL
 */
export function getTelegramApiUrl(botToken: string, method: string): string {
	return `https://api.telegram.org/bot${botToken}/${method}`;
}
