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
import { logError, measureTime } from './utils';
import { createConfig, validateConfig } from './config';

export default {
	/**
	 * HTTP endpoint for testing the scheduled handler
	 */
	fetch(req: Request, _env: Env, _ctx: ExecutionContext): Response {
		const url = new URL(req.url);

		// Handle health check endpoint
		if (url.pathname === '/health') {
			return new Response('OK', { status: 200 });
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
	async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
		const startTime = Date.now();
		console.log(`[SCHEDULED] Cron triggered at ${event.cron} (${new Date().toISOString()})`);

		try {
			// Load and validate configuration
			const config = createConfig(env);
			validateConfig(config);

			// Validate environment
			if (!env.VERSION_STORAGE) {
				throw new WorkerError('VERSION_STORAGE KV namespace not configured', ErrorCode.CONFIG_ERROR);
			}

			// Execute main workflow with performance tracking
			await measureTime(async () => {
				// Step 1-5: Perform version check (fetches changelog, parses, compares, updates state)
				const checkResult = await performVersionCheck({
					changelogUrl: config.githubChangelogUrl,
					kv: env.VERSION_STORAGE,
				});

				// Step 6: Send notification if new version detected
				if (checkResult.shouldNotify) {
					console.log(`[NOTIFICATION] New version detected: ${checkResult.latestVersion} (was: ${checkResult.currentVersion})`);

					// Need to fetch the full changelog data to get Version details
					const { fetchChangelog, parseChangelog } = await import('./changelog');
					const changelogContent = await fetchChangelog(config.githubChangelogUrl);
					const changelogData = parseChangelog(changelogContent);

					if (!changelogData.latestVersion) {
						throw new WorkerError('No version found in changelog', ErrorCode.PARSE_ERROR);
					}

					// Create notification message
					const message = createTelegramMessage(changelogData.latestVersion, config.githubChangelogUrl);

					// Send Telegram notification
					await sendTelegramNotification(
						{
							botToken: config.telegramBotToken,
							chatId: config.telegramChatId,
						},
						message,
					);

					// Update state with notification time
					await updateStateAfterNotification(env.VERSION_STORAGE, checkResult.latestVersion);

					console.log(`[SUCCESS] Notification sent for version ${checkResult.latestVersion}`);
				} else {
					console.log(`[INFO] No new version detected. Current: ${checkResult.currentVersion}`);
				}
			}, 'Main workflow execution');

			// Log execution time
			const duration = Date.now() - startTime;
			console.log(`[COMPLETED] Scheduled handler completed in ${duration}ms`);
		} catch (error) {
			// Log error with context
			logError(error, {
				event: 'scheduled_handler',
				cron: event.cron,
				timestamp: new Date().toISOString(),
			});

			// Determine if error is critical
			if (error instanceof WorkerError) {
				console.error(`[ERROR] Worker error: ${error.message} (Code: ${error.code})`);

				// For config errors, we should alert but not crash
				if (error.code === ErrorCode.CONFIG_ERROR.toString()) {
					console.error('[CRITICAL] Configuration error - worker cannot function properly');
				}
			} else {
				console.error('[ERROR] Unexpected error in scheduled handler:', error);
			}

			// Re-throw to let Cloudflare know the execution failed
			// This ensures proper error tracking in Cloudflare dashboard
			throw error;
		}
	},
} satisfies ExportedHandler<Env>;
