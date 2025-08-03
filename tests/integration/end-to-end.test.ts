/**
 * Integration tests for end-to-end workflow
 * Tests the complete flow from cron trigger to notification
 */

import type { Env, ScheduledEvent, ExecutionContext } from '../../src/types';
import worker from '../../src/index';

// Mock all the modules
jest.mock('../../src/changelog');
jest.mock('../../src/state-manager');
jest.mock('../../src/telegram');
jest.mock('../../src/notification-formatter');
jest.mock('../../src/config');
jest.mock('../../src/logging');
jest.mock('../../src/error-recovery');
jest.mock('../../src/performance');

// Import mocked modules
import { fetchChangelog, parseChangelog } from '../../src/changelog';
import { performVersionCheck, updateStateAfterNotification } from '../../src/state-manager';
import { sendTelegramNotification } from '../../src/telegram';
import { createTelegramMessage } from '../../src/notification-formatter';
import { createConfig, validateConfig } from '../../src/config';
import { logger, configureLogger, createContextLogger } from '../../src/logging';
import { getErrorRecoveryHealth } from '../../src/error-recovery';
import { createPerformanceMiddleware, trackPerformance, getPerformanceHealth } from '../../src/performance';
import { WorkerError } from '../../src/types';
import { ErrorCode } from '../../src/types/models';

// Type the mocked functions
const mockFetchChangelog = fetchChangelog as jest.MockedFunction<typeof fetchChangelog>;
const mockParseChangelog = parseChangelog as jest.MockedFunction<typeof parseChangelog>;
const mockPerformVersionCheck = performVersionCheck as jest.MockedFunction<typeof performVersionCheck>;
const mockUpdateStateAfterNotification = updateStateAfterNotification as jest.MockedFunction<typeof updateStateAfterNotification>;
const mockSendTelegramNotification = sendTelegramNotification as jest.MockedFunction<typeof sendTelegramNotification>;
const mockCreateTelegramMessage = createTelegramMessage as jest.MockedFunction<typeof createTelegramMessage>;
const mockCreateConfig = createConfig as jest.MockedFunction<typeof createConfig>;
const mockValidateConfig = validateConfig as jest.MockedFunction<typeof validateConfig>;
const mockConfigureLogger = configureLogger as jest.MockedFunction<typeof configureLogger>;
const mockCreateContextLogger = createContextLogger as jest.MockedFunction<typeof createContextLogger>;
const mockGetErrorRecoveryHealth = getErrorRecoveryHealth as jest.MockedFunction<typeof getErrorRecoveryHealth>;
const mockCreatePerformanceMiddleware = createPerformanceMiddleware as jest.MockedFunction<typeof createPerformanceMiddleware>;
const mockTrackPerformance = trackPerformance as jest.MockedFunction<typeof trackPerformance>;
const mockGetPerformanceHealth = getPerformanceHealth as jest.MockedFunction<typeof getPerformanceHealth>;

describe('End-to-End Integration Tests', () => {
	let mockEnv: Env;
	let mockEvent: ScheduledEvent;
	let mockContext: ExecutionContext;
	let mockKV: jest.Mocked<KVNamespace>;
	let mockLog: any;
	let mockPerfMonitor: any;

	beforeEach(() => {
		// Setup mock KV namespace
		mockKV = {
			get: jest.fn(),
			put: jest.fn(),
			delete: jest.fn(),
			list: jest.fn(),
			getWithMetadata: jest.fn(),
		} as any;

		// Setup mock environment
		mockEnv = {
			VERSION_STORAGE: mockKV,
			TELEGRAM_BOT_TOKEN: 'test-bot-token',
			TELEGRAM_CHAT_ID: 'test-chat-id',
			TELEGRAM_THREAD_ID: '48',
			GITHUB_CHANGELOG_URL: 'https://example.com/changelog.md',
			LOG_LEVEL: 'INFO',
		} as Env;

		// Setup mock event
		mockEvent = {
			scheduledTime: Date.now(),
			cron: '0 * * * *',
		} as ScheduledEvent;

		// Setup mock execution context
		mockContext = {
			waitUntil: jest.fn(),
			passThroughOnException: jest.fn(),
		} as unknown as ExecutionContext;

		// Setup logger mocks
		mockLog = {
			info: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
		};
		mockCreateContextLogger.mockReturnValue(mockLog);

		// Setup performance monitor mocks
		mockPerfMonitor = {
			start: jest.fn(),
			end: jest.fn().mockReturnValue({
				meetsPerformanceTarget: true,
				internalProcessingDuration: 45,
				apiCallDuration: 200,
				warnings: [],
			}),
		};
		mockCreatePerformanceMiddleware.mockReturnValue(mockPerfMonitor);

		// Setup trackPerformance to execute the passed function
		mockTrackPerformance.mockImplementation(async (name, fn) => fn());

		// Setup default mock returns
		mockCreateConfig.mockReturnValue({
			telegramBotToken: 'test-bot-token',
			telegramChatId: 'test-chat-id',
			githubChangelogUrl: 'https://example.com/changelog.md',
		});

		mockGetErrorRecoveryHealth.mockReturnValue({
			consecutiveFailures: 0,
			lastSuccessTime: new Date().toISOString(),
			isHealthy: true,
		});

		mockGetPerformanceHealth.mockReturnValue({
			averageExecutionTime: 250,
			p95ExecutionTime: 400,
			successRate: 100,
		});

		// Clear all mocks
		jest.clearAllMocks();

		// Mock console to reduce noise
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(console, 'warn').mockImplementation();
		jest.spyOn(console, 'error').mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('Scheduled Handler - Complete Flow', () => {
		describe('New Version Detection Scenario', () => {
			const changelogContent = '# Changelog\n\n## 1.2.0\n- Added new feature\n- Fixed bug';
			const parsedChangelog = {
				versions: [{ version: '1.2.0', date: '2024-01-16', changes: ['Added new feature', 'Fixed bug'] }],
				latestVersion: { version: '1.2.0', date: '2024-01-16', changes: ['Added new feature', 'Fixed bug'] },
			};
			const telegramMessage = '🚀 *New Claude Code Version Released!*\n\nVersion: `1.2.0`';

			beforeEach(() => {
				// Setup successful version check with new version
				mockPerformVersionCheck.mockResolvedValue({
					shouldNotify: true,
					latestVersion: '1.2.0',
					currentVersion: '1.1.0',
				});

				// Setup changelog fetching and parsing
				mockFetchChangelog.mockResolvedValue(changelogContent);
				mockParseChangelog.mockReturnValue(parsedChangelog);

				// Setup message creation
				mockCreateTelegramMessage.mockReturnValue(telegramMessage);

				// Setup successful Telegram notification
				mockSendTelegramNotification.mockResolvedValue(undefined);

				// Setup successful state update
				mockUpdateStateAfterNotification.mockResolvedValue(undefined);
			});

			it('should complete full workflow when new version is detected', async () => {
				await worker.scheduled(mockEvent, mockEnv, mockContext);

				// Verify logger configuration
				expect(mockConfigureLogger).toHaveBeenCalledWith({
					minLevel: 'INFO',
					executionContext: mockContext,
				});

				// Verify performance monitoring started
				expect(mockPerfMonitor.start).toHaveBeenCalled();

				// Verify config creation and validation
				expect(mockCreateConfig).toHaveBeenCalledWith(mockEnv);
				expect(mockValidateConfig).toHaveBeenCalled();

				// Verify version check was performed
				expect(mockPerformVersionCheck).toHaveBeenCalledWith({
					changelogUrl: 'https://example.com/changelog.md',
					kv: mockKV,
				});

				// Verify changelog was fetched for details
				expect(mockFetchChangelog).toHaveBeenCalledWith('https://example.com/changelog.md');
				expect(mockParseChangelog).toHaveBeenCalledWith(changelogContent);

				// Verify message creation
				expect(mockCreateTelegramMessage).toHaveBeenCalledWith(
					parsedChangelog.latestVersion,
					'https://example.com/changelog.md'
				);

				// Verify Telegram notification was sent with thread ID
				expect(mockSendTelegramNotification).toHaveBeenCalledWith(
					{
						botToken: 'test-bot-token',
						chatId: 'test-chat-id',
						threadId: '48',
					},
					telegramMessage
				);

				// Verify state was updated after notification
				expect(mockUpdateStateAfterNotification).toHaveBeenCalledWith(mockKV, '1.2.0');

				// Verify performance monitoring ended
				expect(mockPerfMonitor.end).toHaveBeenCalled();

				// Verify success logging
				expect(mockLog.info).toHaveBeenCalledWith('New version detected', {
					newVersion: '1.2.0',
					previousVersion: '1.1.0',
				});
				expect(mockLog.info).toHaveBeenCalledWith('Notification sent successfully', {
					version: '1.2.0',
				});
			});

			it('should handle thread ID being optional', async () => {
				// Remove thread ID from environment
				delete mockEnv.TELEGRAM_THREAD_ID;

				await worker.scheduled(mockEvent, mockEnv, mockContext);

				// Verify Telegram notification was sent without thread ID
				expect(mockSendTelegramNotification).toHaveBeenCalledWith(
					{
						botToken: 'test-bot-token',
						chatId: 'test-chat-id',
						threadId: undefined,
					},
					telegramMessage
				);
			});
		});

		describe('No Update Scenario', () => {
			beforeEach(() => {
				// Setup version check with no new version
				mockPerformVersionCheck.mockResolvedValue({
					shouldNotify: false,
					latestVersion: '1.1.0',
					currentVersion: '1.1.0',
				});
			});

			it('should handle case when no new version is available', async () => {
				await worker.scheduled(mockEvent, mockEnv, mockContext);

				// Verify version check was performed
				expect(mockPerformVersionCheck).toHaveBeenCalled();

				// Verify no changelog fetching or notification sending
				expect(mockFetchChangelog).not.toHaveBeenCalled();
				expect(mockSendTelegramNotification).not.toHaveBeenCalled();
				expect(mockUpdateStateAfterNotification).not.toHaveBeenCalled();

				// Verify appropriate logging
				expect(mockLog.info).toHaveBeenCalledWith('No new version detected', {
					currentVersion: '1.1.0',
				});
			});
		});

		describe('Error Handling Scenarios', () => {
			it('should handle missing KV namespace', async () => {
				delete mockEnv.VERSION_STORAGE;

				await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toThrow(WorkerError);
				await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toThrow(
					'VERSION_STORAGE KV namespace not configured'
				);

				// Verify performance monitoring still ended
				expect(mockPerfMonitor.end).toHaveBeenCalled();

				// Verify error was logged
				expect(logger.error).toHaveBeenCalledWith(
					'Scheduled handler failed',
					expect.objectContaining({
						error: 'VERSION_STORAGE KV namespace not configured',
					})
				);
			});

			it('should handle config validation failure', async () => {
				mockValidateConfig.mockImplementation(() => {
					throw new WorkerError('Invalid config', ErrorCode.CONFIG_ERROR);
				});

				await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toThrow('Invalid config');

				// Verify critical error was logged
				expect(logger.critical).toHaveBeenCalledWith(
					'Configuration error - worker cannot function properly',
					expect.any(Object)
				);
			});

			it('should handle changelog fetch failure', async () => {
				mockPerformVersionCheck.mockResolvedValue({
					shouldNotify: true,
					latestVersion: '1.2.0',
					currentVersion: '1.1.0',
				});

				mockFetchChangelog.mockRejectedValue(new Error('Network error'));

				await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toThrow('Network error');

				// Verify error was logged with context
				expect(logger.error).toHaveBeenCalledWith(
					'Scheduled handler failed',
					expect.objectContaining({
						error: 'Network error',
					})
				);
			});

			it('should handle changelog parse failure', async () => {
				mockPerformVersionCheck.mockResolvedValue({
					shouldNotify: true,
					latestVersion: '1.2.0',
					currentVersion: '1.1.0',
				});

				mockFetchChangelog.mockResolvedValue('# Changelog\nInvalid content');
				mockParseChangelog.mockReturnValue({ versions: [], latestVersion: null });

				await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toThrow(
					'No version found in changelog'
				);

				// Verify critical error was logged for parse failure
				expect(logger.critical).toHaveBeenCalledWith(
					'Changelog parsing failed - possible format change',
					expect.any(Object)
				);
			});

			it('should handle Telegram notification failure', async () => {
				mockPerformVersionCheck.mockResolvedValue({
					shouldNotify: true,
					latestVersion: '1.2.0',
					currentVersion: '1.1.0',
				});

				mockFetchChangelog.mockResolvedValue('# Changelog\n## 1.2.0');
				mockParseChangelog.mockReturnValue({
					versions: [{ version: '1.2.0' }],
					latestVersion: { version: '1.2.0' },
				});

				mockSendTelegramNotification.mockRejectedValue(new Error('Telegram API error'));

				await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toThrow('Telegram API error');
			});

			it('should handle state update failure after notification', async () => {
				mockPerformVersionCheck.mockResolvedValue({
					shouldNotify: true,
					latestVersion: '1.2.0',
					currentVersion: '1.1.0',
				});

				mockFetchChangelog.mockResolvedValue('# Changelog\n## 1.2.0');
				mockParseChangelog.mockReturnValue({
					versions: [{ version: '1.2.0' }],
					latestVersion: { version: '1.2.0' },
				});

				mockUpdateStateAfterNotification.mockRejectedValue(
					new WorkerError('State update failed', ErrorCode.STORAGE_ERROR)
				);

				await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toThrow('State update failed');
			});

			it('should handle unexpected errors', async () => {
				const unexpectedError = { notAnError: true };
				mockPerformVersionCheck.mockRejectedValue(unexpectedError);

				await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toEqual(unexpectedError);

				// Verify generic error logging
				expect(logger.error).toHaveBeenCalledWith(
					'Unexpected error in scheduled handler',
					expect.objectContaining({
						errorType: 'Unknown',
						message: '[object Object]',
					})
				);
			});
		});

		describe('Performance Tracking', () => {
			it('should track performance for all operations', async () => {
				mockPerformVersionCheck.mockResolvedValue({
					shouldNotify: true,
					latestVersion: '1.2.0',
					currentVersion: '1.1.0',
				});

				mockFetchChangelog.mockResolvedValue('# Changelog\n## 1.2.0');
				mockParseChangelog.mockReturnValue({
					versions: [{ version: '1.2.0' }],
					latestVersion: { version: '1.2.0' },
				});

				await worker.scheduled(mockEvent, mockEnv, mockContext);

				// Verify all performance tracking calls
				expect(mockTrackPerformance).toHaveBeenCalledWith(
					'main_workflow',
					expect.any(Function),
					{ workflow: 'main' }
				);
				expect(mockTrackPerformance).toHaveBeenCalledWith(
					'fetch_changelog_details',
					expect.any(Function)
				);
				expect(mockTrackPerformance).toHaveBeenCalledWith(
					'send_telegram_notification',
					expect.any(Function)
				);
				expect(mockTrackPerformance).toHaveBeenCalledWith(
					'update_notification_state',
					expect.any(Function)
				);
			});

			it('should include performance summary in logs', async () => {
				mockPerformVersionCheck.mockResolvedValue({
					shouldNotify: false,
					latestVersion: '1.1.0',
					currentVersion: '1.1.0',
				});

				const perfSummary = {
					meetsPerformanceTarget: false,
					internalProcessingDuration: 100,
					apiCallDuration: 500,
					warnings: ['API calls exceeded 300ms threshold'],
				};
				mockPerfMonitor.end.mockReturnValue(perfSummary);

				await worker.scheduled(mockEvent, mockEnv, mockContext);

				// Verify performance summary was logged
				expect(mockLog.info).toHaveBeenCalledWith(
					'Scheduled handler completed',
					expect.objectContaining({
						performanceSummary: {
							meetsTarget: false,
							internalProcessing: 100,
							apiCalls: 500,
						},
					})
				);
			});
		});
	});

	describe('Fetch Handler - Health Check', () => {
		it('should return health status on /health endpoint', async () => {
			const request = new Request('http://localhost:8787/health');
			const response = await worker.fetch(request, mockEnv, mockContext);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('application/json');

			const health = await response.json();
			expect(health).toMatchObject({
				status: 'OK',
				timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
				errorRecovery: {
					consecutiveFailures: 0,
					lastSuccessTime: expect.any(String),
					isHealthy: true,
				},
				performance: {
					averageExecutionTime: 250,
					p95ExecutionTime: 400,
					successRate: 100,
				},
			});
		});

		it('should return instructions for root path', async () => {
			const request = new Request('http://localhost:8787/');
			const response = await worker.fetch(request, mockEnv, mockContext);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('text/plain');

			const text = await response.text();
			expect(text).toContain('Claude Code Version Monitor');
			expect(text).toContain('To test the scheduled handler');
			expect(text).toContain('__scheduled?cron=');
		});
	});

	describe('Edge Cases and Boundary Conditions', () => {
		it('should handle empty changelog URL', async () => {
			mockCreateConfig.mockReturnValue({
				telegramBotToken: 'test-bot-token',
				telegramChatId: 'test-chat-id',
				githubChangelogUrl: '',
			});

			mockValidateConfig.mockImplementation(() => {
				throw new WorkerError('Invalid changelog URL', ErrorCode.CONFIG_ERROR);
			});

			await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toThrow('Invalid changelog URL');
		});

		it('should handle missing telegram credentials', async () => {
			delete mockEnv.TELEGRAM_BOT_TOKEN;
			delete mockEnv.TELEGRAM_CHAT_ID;

			mockCreateConfig.mockReturnValue({
				telegramBotToken: '',
				telegramChatId: '',
				githubChangelogUrl: 'https://example.com/changelog.md',
			});

			mockValidateConfig.mockImplementation(() => {
				throw new WorkerError('Missing Telegram credentials', ErrorCode.CONFIG_ERROR);
			});

			await expect(worker.scheduled(mockEvent, mockEnv, mockContext)).rejects.toThrow(
				'Missing Telegram credentials'
			);
		});

		it('should handle very long execution times', async () => {
			// Mock a slow version check
			mockPerformVersionCheck.mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				return {
					shouldNotify: false,
					latestVersion: '1.1.0',
					currentVersion: '1.1.0',
				};
			});

			const startTime = Date.now();
			await worker.scheduled(mockEvent, mockEnv, mockContext);
			const duration = Date.now() - startTime;

			// Verify duration was logged
			expect(mockLog.info).toHaveBeenCalledWith(
				'Scheduled handler completed',
				expect.objectContaining({
					duration: expect.any(Number),
				})
			);
		});
	});
});