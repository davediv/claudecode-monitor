/**
 * State management orchestration module
 * Handles the initialization and management of application state
 */

import type { StorageState } from './types/models';
import { ErrorCode } from './types/models';
import { WorkerError } from './types/index';
import { fetchChangelog, extractLatestVersion, compareVersions, isValidSemver } from './changelog';
import { isFirstRun, initializeState, getState, setState } from './storage';
import { measureTime, logError } from './utils';

/**
 * Configuration for state initialization
 */
export interface StateInitConfig {
	changelogUrl: string;
	kv: KVNamespace;
	signal?: AbortSignal;
}

/**
 * Result of state initialization
 */
export interface StateInitResult {
	isFirstRun: boolean;
	currentState: StorageState;
	versionFromChangelog: string;
	shouldNotify: boolean;
}

/**
 * Handles the complete state initialization flow
 * @param config - Configuration for state initialization
 * @returns State initialization result
 * @throws {WorkerError} If initialization fails
 */
export async function handleStateInitialization(config: StateInitConfig): Promise<StateInitResult> {
	const { changelogUrl, kv, signal } = config;

	try {
		console.log('Starting state initialization check...');

		// Step 1: Check if this is the first run
		const firstRun = await measureTime(async () => isFirstRun(kv), 'First run check');

		// Step 2: Fetch current version from changelog
		const markdown = await fetchChangelog(changelogUrl, signal);
		const versionFromChangelog = extractLatestVersion(markdown);

		if (!versionFromChangelog) {
			throw new WorkerError('No version found in changelog', ErrorCode.PARSE_ERROR, { changelogUrl });
		}

		console.log(`Latest version from changelog: ${versionFromChangelog}`);

		// Step 3: Handle first run scenario
		if (firstRun) {
			console.log('First run detected, initializing state...');

			const initialState = await initializeState(kv, versionFromChangelog);

			return {
				isFirstRun: true,
				currentState: initialState,
				versionFromChangelog,
				shouldNotify: false, // Never notify on first run
			};
		}

		// Step 4: Handle existing state scenario
		const currentState = await getState(kv);

		if (!currentState) {
			// This shouldn't happen, but handle it gracefully
			throw new WorkerError('State should exist but was not found', ErrorCode.STORAGE_ERROR);
		}

		console.log(`Current state: version=${currentState.lastVersion}, lastCheck=${currentState.lastCheckTime}`);

		// Update the last check time
		const updatedState: StorageState = {
			...currentState,
			lastCheckTime: new Date().toISOString(),
		};

		await setState(kv, updatedState);

		return {
			isFirstRun: false,
			currentState: updatedState,
			versionFromChangelog,
			shouldNotify: false, // Notification logic will be handled elsewhere
		};
	} catch (error) {
		// Log the error with context
		logError(error, {
			operation: 'handleStateInitialization',
			changelogUrl,
		});

		// Re-throw WorkerError as-is
		if (error instanceof WorkerError) {
			throw error;
		}

		// Wrap other errors
		throw new WorkerError(
			`State initialization failed: ${error instanceof Error ? error.message : String(error)}`,
			ErrorCode.STORAGE_ERROR,
			{ originalError: error },
		);
	}
}

/**
 * Checks if a new version is available and should trigger a notification
 * @param currentVersion - Current version from state
 * @param latestVersion - Latest version from changelog
 * @returns true if a new version is available
 */
export function isNewVersionAvailable(currentVersion: string, latestVersion: string): boolean {
	// Validate versions
	if (!isValidSemver(currentVersion) || !isValidSemver(latestVersion)) {
		console.warn(`Invalid version format: current=${currentVersion}, latest=${latestVersion}`);
		return false;
	}

	// Compare versions
	return compareVersions(latestVersion, currentVersion) > 0;
}

/**
 * Updates the state after a successful notification
 * @param kv - KV namespace
 * @param newVersion - The new version that was notified
 * @returns Updated state
 * @throws {WorkerError} If update fails
 */
export async function updateStateAfterNotification(kv: KVNamespace, newVersion: string): Promise<StorageState> {
	const currentState = await getState(kv);

	if (!currentState) {
		throw new WorkerError('Cannot update state: no current state exists', ErrorCode.STORAGE_ERROR);
	}

	const now = new Date().toISOString();
	const updatedState: StorageState = {
		lastVersion: newVersion,
		lastCheckTime: now,
		lastNotificationTime: now,
	};

	await setState(kv, updatedState);
	console.log(`State updated after notification: version=${newVersion}`);

	return updatedState;
}

/**
 * Performs a complete version check workflow
 * @param config - Configuration for the check
 * @returns true if a notification should be sent
 * @throws {WorkerError} If check fails
 */
export async function performVersionCheck(config: StateInitConfig): Promise<{
	shouldNotify: boolean;
	currentVersion: string;
	latestVersion: string;
	state: StorageState;
}> {
	// Initialize or get current state
	const initResult = await handleStateInitialization(config);

	// Never notify on first run
	if (initResult.isFirstRun) {
		return {
			shouldNotify: false,
			currentVersion: initResult.currentState.lastVersion,
			latestVersion: initResult.versionFromChangelog,
			state: initResult.currentState,
		};
	}

	// Check if new version is available
	const hasNewVersion = isNewVersionAvailable(initResult.currentState.lastVersion, initResult.versionFromChangelog);

	return {
		shouldNotify: hasNewVersion,
		currentVersion: initResult.currentState.lastVersion,
		latestVersion: initResult.versionFromChangelog,
		state: initResult.currentState,
	};
}
