/**
 * Changelog fetching and parsing module
 * Handles retrieving and parsing the Claude Code changelog from GitHub
 */

import type { Version, ChangelogData } from './types/models';
import { ErrorCode } from './types/models';
import { WorkerError } from './types';
import { measureTime, logError } from './utils';

/**
 * Maximum allowed size for changelog file (1MB)
 */
const MAX_CHANGELOG_SIZE = 1024 * 1024; // 1MB

/**
 * Default timeout for fetch operations (10 seconds)
 */
const FETCH_TIMEOUT = 10000; // 10 seconds

/**
 * Fetches the changelog from GitHub with proper error handling
 * @param url - The URL to fetch the changelog from
 * @param signal - Optional AbortSignal for cancellation
 * @returns The raw markdown content
 * @throws {WorkerError} If fetch fails or content exceeds size limit
 */
export async function fetchChangelog(url: string, signal?: AbortSignal): Promise<string> {
	try {
		console.log(`Fetching changelog from: ${url}`);

		// Create timeout signal if not provided
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
		const fetchSignal = signal || controller.signal;

		const response = await measureTime(
			async () =>
				fetch(url, {
					signal: fetchSignal,
					headers: {
						'User-Agent': 'claude-code-monitor/1.0',
						Accept: 'text/plain, text/markdown',
					},
				}),
			'Changelog fetch',
		);

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new WorkerError(`Failed to fetch changelog: ${response.status} ${response.statusText}`, ErrorCode.FETCH_ERROR, {
				status: response.status,
				statusText: response.statusText,
				url,
			});
		}

		const content = await response.text();
		console.log(`Fetched changelog, size: ${content.length} bytes`);

		// Check file size limit
		if (content.length > MAX_CHANGELOG_SIZE) {
			throw new WorkerError(`Changelog file exceeds ${MAX_CHANGELOG_SIZE / 1024 / 1024}MB limit`, ErrorCode.FETCH_ERROR, {
				size: content.length,
				limit: MAX_CHANGELOG_SIZE,
			});
		}

		// Validate content is not empty
		if (!content || content.trim().length === 0) {
			throw new WorkerError('Changelog file is empty', ErrorCode.FETCH_ERROR, { url });
		}

		return content;
	} catch (error) {
		// Handle abort/timeout
		if (error instanceof Error && error.name === 'AbortError') {
			throw new WorkerError('Changelog fetch timed out', ErrorCode.FETCH_ERROR, { timeout: FETCH_TIMEOUT, url });
		}

		// Re-throw WorkerError as-is
		if (error instanceof WorkerError) {
			throw error;
		}

		// Log unexpected errors
		logError(error, { url, operation: 'fetchChangelog' });

		// Wrap other errors
		throw new WorkerError(
			`Unexpected error fetching changelog: ${error instanceof Error ? error.message : String(error)}`,
			ErrorCode.FETCH_ERROR,
			{ originalError: error, url },
		);
	}
}

/**
 * Parses the changelog markdown to extract version information
 * @param markdown - The raw markdown content
 * @returns Parsed changelog data
 */
export function parseChangelog(markdown: string): ChangelogData {
	const versions: Version[] = [];

	// Regex to match version headers like ## [1.2.3] - 2024-01-15
	// const versionRegex = /^##\s*\[?v?(\d+\.\d+\.\d+)\]?\s*-?\s*(\d{4}-\d{2}-\d{2})/gm;

	const lines = markdown.split('\n');
	let currentVersion: Version | null = null;
	let currentChanges: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const versionMatch = line.match(/^##\s*\[?v?(\d+\.\d+\.\d+)\]?\s*-?\s*(\d{4}-\d{2}-\d{2})/);

		if (versionMatch) {
			// Save previous version if exists
			if (currentVersion) {
				currentVersion.changes = currentChanges;
				versions.push(currentVersion);
			}

			// Start new version
			currentVersion = {
				version: versionMatch[1],
				date: versionMatch[2],
				changes: [],
			};
			currentChanges = [];
		} else if (currentVersion && line.trim()) {
			// Collect changes for current version
			if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
				currentChanges.push(line.trim());
			}
		}
	}

	// Don't forget the last version
	if (currentVersion) {
		currentVersion.changes = currentChanges;
		versions.push(currentVersion);
	}

	return {
		versions,
		latestVersion: versions.length > 0 ? versions[0] : null,
	};
}

/**
 * Compares two semantic versions
 * @param v1 - First version
 * @param v2 - Second version
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
	const parts1 = v1.split('.').map(Number);
	const parts2 = v2.split('.').map(Number);

	for (let i = 0; i < 3; i++) {
		if (parts1[i] > parts2[i]) return 1;
		if (parts1[i] < parts2[i]) return -1;
	}

	return 0;
}
