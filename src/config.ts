/**
 * Configuration helper for type-safe environment access
 */

import type { AppConfig } from './types';

/**
 * Creates a type-safe configuration object from the environment
 * @param env - Cloudflare Worker environment
 * @returns Configuration object
 */
export function createConfig(env: Env): AppConfig {
  return {
    githubChangelogUrl: env.GITHUB_CHANGELOG_URL,
    telegramChatId: env.TELEGRAM_CHAT_ID,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    versionStorage: env.VERSION_STORAGE,
  };
}

/**
 * Validates that all required configuration is present
 * @param config - Application configuration
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: AppConfig): void {
  const errors: string[] = [];

  if (!config.telegramBotToken) {
    errors.push('TELEGRAM_BOT_TOKEN is required');
  }

  if (!config.telegramChatId) {
    errors.push('TELEGRAM_CHAT_ID is required');
  }

  if (!config.githubChangelogUrl) {
    errors.push('GITHUB_CHANGELOG_URL is required');
  }

  if (!config.versionStorage) {
    errors.push('VERSION_STORAGE KV namespace is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}