/**
 * Unit tests for notification formatter module
 * Tests all formatting functions for message compliance and markdown rendering
 */

import {
	escapeMarkdown,
	formatDate,
	formatChanges,
	createTelegramMessage,
	formatTelegramNotification,
	formatNotification,
	type FormatOptions,
} from '../../src/notification-formatter';
import { ErrorCode } from '../../src/types/models';
import { WorkerError } from '../../src/types';
import type { Version, TelegramMessage } from '../../src/types/models';

describe('Notification Formatter', () => {
	describe('escapeMarkdown', () => {
		it('should escape all Telegram MarkdownV2 special characters', () => {
			const input = '_*[]()~`>#+-=|{}.!';
			const expected = '\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!';
			expect(escapeMarkdown(input)).toBe(expected);
		});

		it('should escape special characters within text', () => {
			const input = 'Hello_world! This is *bold* and `code`.';
			const expected = 'Hello\\_world\\! This is \\*bold\\* and \\`code\\`\\.';
			expect(escapeMarkdown(input)).toBe(expected);
		});

		it('should handle empty string', () => {
			expect(escapeMarkdown('')).toBe('');
		});

		it('should handle text without special characters', () => {
			const input = 'Hello world this is plain text';
			expect(escapeMarkdown(input)).toBe(input);
		});

		it('should escape repeated special characters', () => {
			const input = '***___```';
			const expected = '\\*\\*\\*\\_\\_\\_\\`\\`\\`';
			expect(escapeMarkdown(input)).toBe(expected);
		});

		it('should escape characters in URLs', () => {
			const input = 'https://github.com/user/repo_name';
			const expected = 'https://github\\.com/user/repo\\_name';
			expect(escapeMarkdown(input)).toBe(expected);
		});
	});

	describe('formatDate', () => {
		it('should format valid ISO date string', () => {
			const date = '2024-01-15';
			const result = formatDate(date);
			expect(result).toBe('January 15, 2024');
		});

		it('should format date with custom locale', () => {
			const date = '2024-01-15';
			const result = formatDate(date, { dateLocale: 'fr-FR' });
			expect(result).toBe('15 janvier 2024');
		});

		it('should format date with custom options', () => {
			const date = '2024-01-15';
			const result = formatDate(date, {
				dateFormatOptions: {
					year: '2-digit',
					month: '2-digit',
					day: '2-digit',
				},
			});
			expect(result).toBe('01/15/24');
		});

		it('should return "Unknown" for undefined date', () => {
			expect(formatDate(undefined)).toBe('Unknown');
		});

		it('should return "Unknown" for empty string', () => {
			expect(formatDate('')).toBe('Unknown');
		});

		it('should return "Unknown" for "Unknown" string', () => {
			expect(formatDate('Unknown')).toBe('Unknown');
		});

		it('should return "Unknown" for invalid date string', () => {
			expect(formatDate('not-a-date')).toBe('Unknown');
			expect(formatDate('2024-13-45')).toBe('Unknown');
		});

		it('should handle datetime strings', () => {
			const datetime = '2024-01-15T10:30:00Z';
			const result = formatDate(datetime);
			expect(result).toBe('January 15, 2024');
		});
	});

	describe('formatChanges', () => {
		it('should format array of changes with bullets', () => {
			const changes = ['Added feature A', 'Fixed bug B', 'Updated docs'];
			const result = formatChanges(changes);
			expect(result).toBe('• Added feature A\n• Fixed bug B\n• Updated docs');
		});

		it('should remove existing bullet points', () => {
			const changes = ['- Added feature A', '* Fixed bug B', '• Updated docs'];
			const result = formatChanges(changes);
			expect(result).toBe('• Added feature A\n• Fixed bug B\n• Updated docs');
		});

		it('should escape markdown when enabled', () => {
			const changes = ['Added *bold* feature', 'Fixed `code` bug'];
			const result = formatChanges(changes, { escapeMarkdown: true });
			expect(result).toBe('• Added \\*bold\\* feature\n• Fixed \\`code\\` bug');
		});

		it('should not escape markdown when disabled', () => {
			const changes = ['Added *bold* feature', 'Fixed `code` bug'];
			const result = formatChanges(changes, { escapeMarkdown: false });
			expect(result).toBe('• Added *bold* feature\n• Fixed `code` bug');
		});

		it('should limit changes to maxChanges', () => {
			const changes = Array(15).fill('Change');
			const result = formatChanges(changes, { maxChanges: 5 });
			expect(result.split('\n').length).toBe(6); // 5 changes + "and more" line
			expect(result).toContain('_\\.\\.\\.\\. and more_');
		});

		it('should show "and more" text when changes exceed limit', () => {
			const changes = Array(15).fill('Change');
			const result = formatChanges(changes, { maxChanges: 10, escapeMarkdown: true });
			expect(result).toContain('_\\.\\.\\.\\. and more_');
		});

		it('should not show "and more" when changes equal limit', () => {
			const changes = Array(10).fill('Change');
			const result = formatChanges(changes, { maxChanges: 10 });
			expect(result).not.toContain('and more');
		});

		it('should return "No changes listed" for empty array', () => {
			expect(formatChanges([])).toBe('No changes listed');
		});

		it('should return "No changes listed" for null', () => {
			expect(formatChanges(null as any)).toBe('No changes listed');
		});

		it('should return "No changes listed" for undefined', () => {
			expect(formatChanges(undefined as any)).toBe('No changes listed');
		});

		it('should trim whitespace from changes', () => {
			const changes = ['  Added feature  ', '\tFixed bug\t', ' Updated docs '];
			const result = formatChanges(changes);
			expect(result).toBe('• Added feature\n• Fixed bug\n• Updated docs');
		});
	});

	describe('createTelegramMessage', () => {
		const mockVersion: Version = {
			version: '1.0.0',
			date: '2024-01-15',
			changes: ['Added feature', 'Fixed bug'],
		};

		it('should create TelegramMessage from Version object', () => {
			const changelogUrl = 'https://example.com/changelog';
			const result = createTelegramMessage(mockVersion, changelogUrl);
			
			expect(result).toEqual({
				version: '1.0.0',
				date: '2024-01-15',
				changes: ['Added feature', 'Fixed bug'],
				changelogUrl,
			});
		});

		it('should handle version with empty changes', () => {
			const version: Version = { ...mockVersion, changes: [] };
			const result = createTelegramMessage(version, 'https://example.com');
			
			expect(result.changes).toEqual([]);
		});

		it('should handle version with undefined changes', () => {
			const version: Version = { ...mockVersion, changes: undefined as any };
			const result = createTelegramMessage(version, 'https://example.com');
			
			expect(result.changes).toEqual([]);
		});

		it('should throw error for null version', () => {
			expect(() => createTelegramMessage(null as any, 'https://example.com')).toThrow(WorkerError);
			expect(() => createTelegramMessage(null as any, 'https://example.com')).toThrow('Invalid version data');
		});

		it('should throw error for version without version field', () => {
			const invalidVersion = { date: '2024-01-15', changes: [] } as any;
			expect(() => createTelegramMessage(invalidVersion, 'https://example.com')).toThrow(WorkerError);
		});

		it('should throw error with correct error code', () => {
			try {
				createTelegramMessage(null as any, 'https://example.com');
				fail('Should have thrown an error');
			} catch (error) {
				expect(error).toBeInstanceOf(WorkerError);
				expect((error as WorkerError).code).toBe(ErrorCode.VALIDATION_ERROR);
			}
		});
	});

	describe('formatTelegramNotification', () => {
		const mockMessage: TelegramMessage = {
			version: '1.0.0',
			date: '2024-01-15',
			changes: ['Added feature A', 'Fixed bug B'],
			changelogUrl: 'https://github.com/example/changelog',
		};

		it('should format message with default options', () => {
			const result = formatTelegramNotification(mockMessage);
			
			expect(result).toContain('🚀 *New Claude Code Release\\!*');
			expect(result).toContain('Version: *v1\\.0\\.0*');
			expect(result).toContain('Released: January 15, 2024');
			expect(result).toContain('*What\'s New:*');
			expect(result).toContain('• Added feature A');
			expect(result).toContain('• Fixed bug B');
			expect(result).toContain('[View on GitHub](https://github.com/example/changelog)');
		});

		it('should format message without emoji when disabled', () => {
			const result = formatTelegramNotification(mockMessage, { includeEmoji: false });
			
			expect(result).not.toContain('🚀');
			expect(result).toContain('*New Claude Code Release\\!*');
		});

		it('should not escape markdown when disabled', () => {
			const result = formatTelegramNotification(mockMessage, { escapeMarkdown: false });
			
			expect(result).toContain('*New Claude Code Release!*'); // No escaped exclamation
			expect(result).toContain('Version: *v1.0.0*'); // No escaped dots
		});

		it('should respect maxChanges option', () => {
			const messageWithManyChanges: TelegramMessage = {
				...mockMessage,
				changes: Array(15).fill('Change'),
			};
			
			const result = formatTelegramNotification(messageWithManyChanges, { maxChanges: 5 });
			const changeLines = result.split('\n').filter(line => line.startsWith('•'));
			
			expect(changeLines.length).toBe(5);
			expect(result).toContain('_\\.\\.\\.\\. and more_');
		});

		it('should use custom date locale and format', () => {
			const result = formatTelegramNotification(mockMessage, {
				dateLocale: 'de-DE',
				dateFormatOptions: { year: 'numeric', month: 'short', day: 'numeric' },
			});
			
			expect(result).toContain('Released: 15. Jan. 2024');
		});

		it('should handle message with Unknown date', () => {
			const messageWithUnknownDate: TelegramMessage = {
				...mockMessage,
				date: 'Unknown',
			};
			
			const result = formatTelegramNotification(messageWithUnknownDate);
			expect(result).toContain('Released: Unknown');
		});

		it('should handle message with special characters in version', () => {
			const messageWithSpecialVersion: TelegramMessage = {
				...mockMessage,
				version: '1.0.0-beta.1',
			};
			
			const result = formatTelegramNotification(messageWithSpecialVersion);
			expect(result).toContain('Version: *v1\\.0\\.0\\-beta\\.1*');
		});

		it('should throw error for null message', () => {
			expect(() => formatTelegramNotification(null as any)).toThrow(WorkerError);
			expect(() => formatTelegramNotification(null as any)).toThrow('Invalid message data');
		});

		it('should throw error for message without version', () => {
			const invalidMessage = { date: '2024-01-15', changes: [], changelogUrl: 'url' } as any;
			expect(() => formatTelegramNotification(invalidMessage)).toThrow(WorkerError);
		});

		it('should preserve exact format from PRD specification', () => {
			const result = formatTelegramNotification(mockMessage);
			const lines = result.split('\n');
			
			// Check structure matches PRD
			expect(lines[0]).toMatch(/^🚀 \*New Claude Code Release\\!\*$/);
			expect(lines[1]).toBe('');
			expect(lines[2]).toMatch(/^Version: \*v[\d\\.\\-]+\*$/);
			expect(lines[3]).toMatch(/^Released: .+$/);
			expect(lines[4]).toBe('');
			expect(lines[5]).toBe('*What\'s New:*');
			// Changes start at line 6
			expect(lines[lines.length - 2]).toBe('');
			expect(lines[lines.length - 1]).toMatch(/^Full changelog: \[View on GitHub\]/);
		});
	});

	describe('formatNotification', () => {
		const mockMessage: TelegramMessage = {
			version: '1.0.0',
			date: '2024-01-15',
			changes: ['Added feature'],
			changelogUrl: 'https://example.com',
		};

		it('should default to telegram platform', () => {
			const result = formatNotification(mockMessage);
			expect(result).toContain('🚀 *New Claude Code Release\\!*');
		});

		it('should format for telegram platform explicitly', () => {
			const result = formatNotification(mockMessage, 'telegram');
			expect(result).toContain('🚀 *New Claude Code Release\\!*');
		});

		it('should format for plain text platform', () => {
			const result = formatNotification(mockMessage, 'plain');
			
			expect(result).not.toContain('*'); // No markdown
			expect(result).toContain('🚀 New Claude Code Release!');
			expect(result).toContain('Version: v1.0.0');
			expect(result).not.toContain('\\'); // No escaped characters
		});

		it('should pass options to underlying formatter', () => {
			const result = formatNotification(mockMessage, 'telegram', { includeEmoji: false });
			expect(result).not.toContain('🚀');
		});

		it('should throw error for unimplemented platforms', () => {
			expect(() => formatNotification(mockMessage, 'slack')).toThrow(WorkerError);
			expect(() => formatNotification(mockMessage, 'slack')).toThrow('Platform slack not yet implemented');
			
			expect(() => formatNotification(mockMessage, 'discord')).toThrow(WorkerError);
			expect(() => formatNotification(mockMessage, 'discord')).toThrow('Platform discord not yet implemented');
		});

		it('should throw error for unknown platform', () => {
			expect(() => formatNotification(mockMessage, 'unknown' as any)).toThrow(WorkerError);
			expect(() => formatNotification(mockMessage, 'unknown' as any)).toThrow('Unknown platform: unknown');
		});

		it('should throw error with correct error code for invalid platform', () => {
			try {
				formatNotification(mockMessage, 'invalid' as any);
				fail('Should have thrown an error');
			} catch (error) {
				expect(error).toBeInstanceOf(WorkerError);
				expect((error as WorkerError).code).toBe(ErrorCode.VALIDATION_ERROR);
			}
		});
	});

	describe('Edge cases and comprehensive scenarios', () => {
		it('should handle very long version strings', () => {
			const message: TelegramMessage = {
				version: '1.0.0-alpha.beta.gamma.delta.epsilon.zeta',
				date: '2024-01-15',
				changes: ['Change'],
				changelogUrl: 'https://example.com',
			};
			
			const result = formatTelegramNotification(message);
			expect(result).toContain('v1\\.0\\.0\\-alpha\\.beta\\.gamma\\.delta\\.epsilon\\.zeta');
		});

		it('should handle changes with markdown characters', () => {
			const message: TelegramMessage = {
				version: '1.0.0',
				date: '2024-01-15',
				changes: [
					'Added `code` support',
					'Fixed *bold* rendering',
					'Updated _italic_ text',
					'Improved [links](url)',
				],
				changelogUrl: 'https://example.com',
			};
			
			const result = formatTelegramNotification(message);
			expect(result).toContain('• Added \\`code\\` support');
			expect(result).toContain('• Fixed \\*bold\\* rendering');
			expect(result).toContain('• Updated \\_italic\\_ text');
			expect(result).toContain('• Improved \\[links\\]\\(url\\)');
		});

		it('should handle empty changes array', () => {
			const message: TelegramMessage = {
				version: '1.0.0',
				date: '2024-01-15',
				changes: [],
				changelogUrl: 'https://example.com',
			};
			
			const result = formatTelegramNotification(message);
			expect(result).toContain('*What\'s New:*\nNo changes listed');
		});

		it('should handle all options together', () => {
			const message: TelegramMessage = {
				version: '2.5.0',
				date: '2024-12-25',
				changes: Array(20).fill('Holiday update'),
				changelogUrl: 'https://github.com/example/releases',
			};
			
			const options: FormatOptions = {
				includeEmoji: false,
				escapeMarkdown: false,
				maxChanges: 3,
				dateLocale: 'ja-JP',
				dateFormatOptions: {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				},
			};
			
			const result = formatTelegramNotification(message, options);
			
			expect(result).not.toContain('🚀');
			expect(result).toContain('*New Claude Code Release!*'); // Not escaped
			expect(result).toContain('Version: *v2.5.0*'); // Not escaped
			expect(result).toMatch(/Released: 2024年12月25日/);
			expect(result.split('\n').filter(line => line.startsWith('•')).length).toBe(3);
			expect(result).toContain('_... and more_'); // Not escaped
		});
	});
});