/**
 * Claude Code Version Monitor - Cloudflare Worker
 *
 * Monitors the Claude Code changelog for new version releases and sends
 * notifications to a Telegram group.
 */

import type { ExportedHandler, ScheduledEvent, ExecutionContext } from './types';
import { WorkerError } from './types';
import { ErrorCode } from './types/models';
import { performVersionCheck, updateStateAfterNotification } from './state-manager';
import { sendTelegramNotification } from './telegram';
import { createTelegramMessage } from './notification-formatter';
import { createConfig, validateConfig } from './config';
import { logger, configureLogger, LogLevel, trackOperation, createContextLogger, sanitizeForLogging } from './logging';
import { getErrorRecoveryHealth } from './error-recovery';

export default {
	/**
	 * HTTP endpoint for testing the scheduled handler
	 */
	fetch(req: Request, _env: Env, _ctx: ExecutionContext): Response {
		const url = new URL(req.url);

		// Handle health check endpoint
		if (url.pathname === '/health') {
			const health = {
				status: 'OK',
				timestamp: new Date().toISOString(),
				errorRecovery: getErrorRecoveryHealth(),
			};
			return new Response(JSON.stringify(health, null, 2), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Provide instructions for testing scheduled handler
		url.pathname = '/__scheduled';
		url.searchParams.append('cron', '* * * * *');
		return new Response(
			`Claude Code Version Monitor\n\nTo test the scheduled handler:\n1. Run with --test-scheduled flag\n2. curl "${url.href}"\n`,
			{ headers: { 'Content-Type': 'text/plain' } },
		);
	},

	/**
	 * Scheduled handler that runs on cron trigger
	 * Implements the main workflow from PRD section 4.2.2
	 */
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		const startTime = Date.now();
		const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`;

		// Configure logger for this execution
		configureLogger({
			minLevel: env.LOG_LEVEL ? (env.LOG_LEVEL as LogLevel) : LogLevel.INFO,
			executionContext: ctx,
		});

		// Create context logger for this execution
		const log = createContextLogger({
			executionId,
			cron: event.cron,
		});

		log.info('Scheduled handler triggered');

		try {
			// Load and validate configuration
			const config = createConfig(env);
			validateConfig(config);

			// Validate environment
			if (!env.VERSION_STORAGE) {
				throw new WorkerError('VERSION_STORAGE KV namespace not configured', ErrorCode.CONFIG_ERROR);
			}

			// Execute main workflow with enhanced tracking
			await trackOperation(
				'main_workflow',
				async () => {
					// Step 1-5: Perform version check (fetches changelog, parses, compares, updates state)
					const checkResult = await performVersionCheck({
						changelogUrl: config.githubChangelogUrl,
						kv: env.VERSION_STORAGE,
					});

					// Step 6: Send notification if new version detected
					if (checkResult.shouldNotify) {
						log.info('New version detected', {
							newVersion: checkResult.latestVersion,
							previousVersion: checkResult.currentVersion,
						});

						// Need to fetch the full changelog data to get Version details
						const { fetchChangelog, parseChangelog } = await import('./changelog');

						const changelogContent = await trackOperation('fetch_changelog_details', () => fetchChangelog(config.githubChangelogUrl));

						const changelogData = parseChangelog(changelogContent);

						if (!changelogData.latestVersion) {
							throw new WorkerError('No version found in changelog', ErrorCode.PARSE_ERROR);
						}

						// Create notification message
						const message = createTelegramMessage(changelogData.latestVersion, config.githubChangelogUrl);

						// Send Telegram notification with tracking
						await trackOperation('send_telegram_notification', async () => {
							await sendTelegramNotification(
								{
									botToken: config.telegramBotToken,
									chatId: config.telegramChatId,
								},
								message,
							);
						});

						// Update state with notification time
						await trackOperation('update_notification_state', () =>
							updateStateAfterNotification(env.VERSION_STORAGE, checkResult.latestVersion),
						);

						log.info('Notification sent successfully', {
							version: checkResult.latestVersion,
						});
					} else {
						log.info('No new version detected', {
							currentVersion: checkResult.currentVersion,
						});
					}
				},
				{ workflow: 'main' },
			);

			// Log execution time
			const duration = Date.now() - startTime;
			log.info('Scheduled handler completed', { duration });
		} catch (error) {
			const duration = Date.now() - startTime;

			// Enhanced error logging with context
			logger.error('Scheduled handler failed', {
				executionId,
				cron: event.cron,
				duration,
				error: error instanceof Error ? error.message : String(error),
			});

			// Determine if error is critical
			if (error instanceof WorkerError) {
				// For config errors, we should alert but not crash in development
				if (error.code === ErrorCode.CONFIG_ERROR.toString()) {
					logger.critical('Configuration error - worker cannot function properly', {
						executionId,
						details: sanitizeForLogging((error.details as Record<string, unknown>) || {}),
					});
				} else if (error.code === ErrorCode.PARSE_ERROR.toString()) {
					logger.critical('Changelog parsing failed - possible format change', {
						executionId,
						details: error.details,
					});
				}
			} else {
				logger.error('Unexpected error in scheduled handler', {
					executionId,
					errorType: error?.constructor?.name || 'Unknown',
					message: error instanceof Error ? error.message : String(error),
				});
			}

			// Re-throw to let Cloudflare know the execution failed
			// This ensures proper error tracking in Cloudflare dashboard
			throw error;
		}
	},
} satisfies ExportedHandler<Env>;
