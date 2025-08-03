/**
 * KV storage operations module
 * Handles state persistence using Cloudflare KV
 */

import type { StorageState } from './types/models';
import { ErrorCode } from './types/models';
import { WorkerError } from './types/index';
import { measureTime, logError } from './utils';

export const STORAGE_KEY = 'claude-code-monitor-state';
export const STATE_TTL = 60 * 60 * 24 * 30; // 30 days TTL for state

/**
 * Validates the storage state data
 * @param data - Data to validate
 * @returns true if valid StorageState
 */
function isValidStorageState(data: unknown): data is StorageState {
	if (!data || typeof data !== 'object') return false;
	const state = data as Record<string, unknown>;
	return (
		typeof state.lastVersion === 'string' &&
		typeof state.lastCheckTime === 'string' &&
		(state.lastNotificationTime === undefined || typeof state.lastNotificationTime === 'string')
	);
}

/**
 * Retrieves the current state from KV storage with retry logic
 * @param kv - Cloudflare KV namespace
 * @param retries - Number of retry attempts (default: 2)
 * @returns The stored state or null if not found
 * @throws {WorkerError} If KV operation fails after retries
 */
export async function getState(kv: KVNamespace, retries = 2): Promise<StorageState | null> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const data = await measureTime(async () => kv.get(STORAGE_KEY, 'json'), `KV get (attempt ${attempt + 1})`);

			if (!data) {
				console.log('No state found in KV storage');
				return null;
			}

			// Validate the data structure
			if (!isValidStorageState(data)) {
				throw new WorkerError('Invalid state data structure in KV storage', ErrorCode.STORAGE_ERROR, { data });
			}

			console.log(`State retrieved: version=${data.lastVersion}, lastCheck=${data.lastCheckTime}`);
			return data;
		} catch (error) {
			lastError = error;
			if (attempt < retries) {
				console.warn(`KV get failed (attempt ${attempt + 1}/${retries + 1}), retrying...`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
			}
		}
	}

	// Log the final error
	logError(lastError, { operation: 'getState', key: STORAGE_KEY });

	// If it's already a WorkerError, re-throw it
	if (lastError instanceof WorkerError) {
		throw lastError;
	}

	// Otherwise, wrap it
	throw new WorkerError(`Failed to retrieve state from KV after ${retries + 1} attempts`, ErrorCode.STORAGE_ERROR, {
		originalError: lastError,
	});
}

/**
 * Updates the state in KV storage with retry logic
 * @param kv - Cloudflare KV namespace
 * @param state - New state to store
 * @param retries - Number of retry attempts (default: 2)
 * @throws {WorkerError} If KV operation fails after retries
 */
export async function setState(kv: KVNamespace, state: StorageState, retries = 2): Promise<void> {
	// Validate state before storing
	if (!isValidStorageState(state)) {
		throw new WorkerError('Invalid state data provided', ErrorCode.STORAGE_ERROR, { state });
	}

	let lastError: unknown;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			await measureTime(
				async () =>
					kv.put(STORAGE_KEY, JSON.stringify(state), {
						expirationTtl: STATE_TTL,
						metadata: {
							updatedAt: new Date().toISOString(),
							version: state.lastVersion,
						},
					}),
				`KV put (attempt ${attempt + 1})`,
			);

			console.log(`State updated: version=${state.lastVersion}, checkTime=${state.lastCheckTime}`);
			return;
		} catch (error) {
			lastError = error;
			if (attempt < retries) {
				console.warn(`KV put failed (attempt ${attempt + 1}/${retries + 1}), retrying...`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
			}
		}
	}

	// Log the final error
	logError(lastError, { operation: 'setState', key: STORAGE_KEY, state });

	// Throw a proper WorkerError
	throw new WorkerError(`Failed to update state in KV after ${retries + 1} attempts`, ErrorCode.STORAGE_ERROR, {
		originalError: lastError,
		state,
	});
}

/**
 * Initializes the state with the current version
 * @param kv - Cloudflare KV namespace
 * @param currentVersion - The current version from changelog
 * @returns The initialized state
 * @throws {WorkerError} If initialization fails
 */
export async function initializeState(kv: KVNamespace, currentVersion: string): Promise<StorageState> {
	if (!currentVersion || typeof currentVersion !== 'string') {
		throw new WorkerError('Invalid version provided for state initialization', ErrorCode.STORAGE_ERROR, { currentVersion });
	}

	const now = new Date().toISOString();
	const initialState: StorageState = {
		lastVersion: currentVersion,
		lastCheckTime: now,
		// Don't set lastNotificationTime on first run to avoid sending notification
	};

	try {
		await setState(kv, initialState);
		console.log(`State initialized with version ${currentVersion} at ${now}`);
		return initialState;
	} catch (error) {
		// Re-throw with more context
		if (error instanceof WorkerError) {
			throw error;
		}
		throw new WorkerError('Failed to initialize state', ErrorCode.STORAGE_ERROR, { originalError: error, currentVersion });
	}
}

/**
 * Checks if this is the first run (no state exists)
 * @param kv - Cloudflare KV namespace
 * @returns True if first run, false otherwise
 * @throws {WorkerError} If check fails
 */
export async function isFirstRun(kv: KVNamespace): Promise<boolean> {
	try {
		const state = await getState(kv, 0); // No retries for existence check
		return state === null;
	} catch (error) {
		// If we get an invalid state error, treat it as first run
		if (error instanceof WorkerError && error.code === ErrorCode.STORAGE_ERROR.toString() && error.message.includes('Invalid state data')) {
			console.warn('Invalid state data found, treating as first run');
			return true;
		}
		// For other errors, re-throw
		throw error;
	}
}

/**
 * Updates only the notification time in the state
 * @param kv - Cloudflare KV namespace
 * @param notificationTime - The time when notification was sent
 * @throws {WorkerError} If update fails
 */
export async function updateNotificationTime(kv: KVNamespace, notificationTime: string): Promise<void> {
	const currentState = await getState(kv);
	if (!currentState) {
		throw new WorkerError('Cannot update notification time: no state exists', ErrorCode.STORAGE_ERROR);
	}

	const updatedState: StorageState = {
		...currentState,
		lastNotificationTime: notificationTime,
	};

	await setState(kv, updatedState);
}

/**
 * Clears the stored state (useful for testing or reset)
 * @param kv - Cloudflare KV namespace
 * @throws {WorkerError} If deletion fails
 */
export async function clearState(kv: KVNamespace): Promise<void> {
	try {
		await measureTime(async () => kv.delete(STORAGE_KEY), 'KV delete');
		console.log('State cleared from KV storage');
	} catch (error) {
		logError(error, { operation: 'clearState', key: STORAGE_KEY });
		throw new WorkerError('Failed to clear state from KV', ErrorCode.STORAGE_ERROR, { originalError: error });
	}
}
