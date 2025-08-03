/**
 * Changelog fetching and parsing module
 * Handles retrieving and parsing the Claude Code changelog from GitHub
 */

import type { Version, ChangelogData } from './types/models';
import { ErrorCode } from './types/models';
import { WorkerError } from './types/index';
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
 * @throws {WorkerError} If markdown is invalid or parsing fails
 */
export function parseChangelog(markdown: string): ChangelogData {
	try {
		if (!markdown || typeof markdown !== 'string') {
			throw new WorkerError('Invalid markdown content provided', ErrorCode.PARSE_ERROR);
		}

		const versions: Version[] = [];
		const lines = markdown.split('\n');
		let currentVersion: Version | null = null;
		let currentChanges: string[] = [];

		// Enhanced regex patterns for different version formats
		// Format 1: ## [1.2.3] - 2024-01-15 (with date)
		// Format 2: ## v1.2.3 - 2024-01-15 (with v prefix and date)
		// Format 3: ## 1.2.3 (version only, like Claude Code changelog)
		// Format 4: ## [v1.2.3] (bracketed with v prefix)
		const versionWithDateRegex = /^##\s*\[?v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)\]?\s*(?:-\s*(\d{4}-\d{2}-\d{2}))?/;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			let versionMatch = line.match(versionWithDateRegex);

			if (versionMatch && versionMatch[1]) {
				// Save previous version if exists
				if (currentVersion && currentChanges.length > 0) {
					currentVersion.changes = currentChanges;
					versions.push(currentVersion);
				}

				// Start new version
				currentVersion = {
					version: versionMatch[1],
					date: versionMatch[2] || 'Unknown',
					changes: [],
				};
				currentChanges = [];
				console.log(`Found version: ${currentVersion.version} (${currentVersion.date})`);
			} else if (currentVersion && line.trim()) {
				// Collect changes for current version
				// Support various bullet formats and also collect subheadings
				if (line.match(/^[-*•]\s+/) || line.match(/^\s+[-*•]\s+/)) {
					currentChanges.push(line.trim());
				} else if (line.match(/^###\s+/)) {
					// Include subheadings like ### Added, ### Fixed
					currentChanges.push(line.trim());
				}
			}
		}

		// Don't forget the last version
		if (currentVersion && currentChanges.length > 0) {
			currentVersion.changes = currentChanges;
			versions.push(currentVersion);
		}

		// Validate we found at least one version
		if (versions.length === 0) {
			throw new WorkerError('No valid version entries found in changelog. Expected format: ## X.X.X', ErrorCode.PARSE_ERROR, {
				markdown: markdown.substring(0, 500),
			});
		}

		console.log(`Successfully parsed ${versions.length} versions from changelog`);

		return {
			versions,
			latestVersion: versions[0],
		};
	} catch (error) {
		// Re-throw WorkerError as-is
		if (error instanceof WorkerError) {
			throw error;
		}

		// Log and wrap other errors
		logError(error, { operation: 'parseChangelog' });
		throw new WorkerError(`Failed to parse changelog: ${error instanceof Error ? error.message : String(error)}`, ErrorCode.PARSE_ERROR, {
			originalError: error,
		});
	}
}

/**
 * Extracts the latest version from changelog content
 * @param markdown - The raw markdown content
 * @returns The latest version string or null if not found
 */
export function extractLatestVersion(markdown: string): string | null {
	try {
		const data = parseChangelog(markdown);
		return data.latestVersion?.version || null;
	} catch (error) {
		console.error('Failed to extract latest version:', error);
		return null;
	}
}

/**
 * Validates if a string is a valid semantic version
 * @param version - Version string to validate
 * @returns true if valid semver format
 */
export function isValidSemver(version: string): boolean {
	// Regex for semantic versioning with optional pre-release and build metadata
	// Format: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
	const semverRegex = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
	return semverRegex.test(version);
}

/**
 * Checks if version v1 is newer than version v2
 * @param v1 - First version to check
 * @param v2 - Second version to compare against
 * @returns true if v1 is newer than v2
 * @throws {WorkerError} If versions are invalid
 */
export function isNewerVersion(v1: string, v2: string): boolean {
	return compareVersions(v1, v2) > 0;
}

/**
 * Parses a semantic version string into its components
 * @param version - Version string to parse
 * @returns Parsed version components
 */
function parseSemanticVersion(version: string): {
	major: number;
	minor: number;
	patch: number;
	prerelease?: string;
	build?: string;
} {
	// Remove build metadata for comparison (build metadata doesn't affect version precedence)
	const [versionWithoutBuild, build] = version.split('+');
	const [mainPart, prerelease] = versionWithoutBuild.split('-');
	const [major, minor, patch] = mainPart.split('.').map(Number);

	return { major, minor, patch, prerelease, build };
}

/**
 * Compares pre-release versions according to semver spec
 * @param pre1 - First pre-release string
 * @param pre2 - Second pre-release string
 * @returns 1 if pre1 > pre2, -1 if pre1 < pre2, 0 if equal
 */
function comparePrereleases(pre1: string, pre2: string): number {
	// Split by dots to get identifiers
	const parts1 = pre1.split('.');
	const parts2 = pre2.split('.');

	// Compare each part
	for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
		// If one version has fewer parts, it's less
		if (i >= parts1.length) return -1;
		if (i >= parts2.length) return 1;

		const part1 = parts1[i];
		const part2 = parts2[i];

		// Try to parse as numbers
		const num1 = parseInt(part1, 10);
		const num2 = parseInt(part2, 10);

		// If both are numeric, compare numerically
		if (!isNaN(num1) && !isNaN(num2)) {
			if (num1 !== num2) return num1 > num2 ? 1 : -1;
		} else if (!isNaN(num1)) {
			// Numeric identifiers always have lower precedence than non-numeric
			return -1;
		} else if (!isNaN(num2)) {
			return 1;
		} else {
			// Both are non-numeric, compare lexically
			const cmp = part1.localeCompare(part2);
			if (cmp !== 0) return cmp > 0 ? 1 : -1;
		}
	}

	return 0;
}

/**
 * Compares two semantic versions according to semver specification
 * @param v1 - First version
 * @param v2 - Second version
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 * @throws {WorkerError} If versions are invalid
 */
export function compareVersions(v1: string, v2: string): number {
	if (!isValidSemver(v1) || !isValidSemver(v2)) {
		throw new WorkerError(`Invalid semantic version format. v1: "${v1}", v2: "${v2}"`, ErrorCode.PARSE_ERROR);
	}

	const p1 = parseSemanticVersion(v1);
	const p2 = parseSemanticVersion(v2);

	// Compare major.minor.patch
	if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
	if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
	if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

	// If one has prerelease and other doesn't, version without prerelease is greater
	if (p1.prerelease && !p2.prerelease) return -1;
	if (!p1.prerelease && p2.prerelease) return 1;

	// If both have prereleases, compare them according to semver spec
	if (p1.prerelease && p2.prerelease) {
		return comparePrereleases(p1.prerelease, p2.prerelease);
	}

	// Build metadata does not affect version precedence
	return 0;
}
