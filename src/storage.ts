/**
 * KV storage operations module
 * Handles state persistence using Cloudflare KV
 */

export interface StorageState {
  lastVersion: string;
  lastCheckTime: string;
  lastNotificationTime?: string;
}

export const STORAGE_KEY = 'claude-code-monitor-state';

/**
 * Retrieves the current state from KV storage
 * @param kv - Cloudflare KV namespace
 * @returns The stored state or null if not found
 */
export async function getState(kv: KVNamespace): Promise<StorageState | null> {
  try {
    const data = await kv.get(STORAGE_KEY, 'json');
    return data as StorageState | null;
  } catch (error) {
    console.error('Error retrieving state from KV:', error);
    return null;
  }
}

/**
 * Updates the state in KV storage
 * @param kv - Cloudflare KV namespace
 * @param state - New state to store
 */
export async function setState(kv: KVNamespace, state: StorageState): Promise<void> {
  try {
    await kv.put(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error storing state in KV:', error);
    throw new Error(`Failed to update state: ${error}`);
  }
}

/**
 * Initializes the state with the current version
 * @param kv - Cloudflare KV namespace
 * @param currentVersion - The current version from changelog
 * @returns The initialized state
 */
export async function initializeState(
  kv: KVNamespace,
  currentVersion: string
): Promise<StorageState> {
  const now = new Date().toISOString();
  const initialState: StorageState = {
    lastVersion: currentVersion,
    lastCheckTime: now,
  };
  
  await setState(kv, initialState);
  console.log(`State initialized with version ${currentVersion}`);
  
  return initialState;
}

/**
 * Checks if this is the first run (no state exists)
 * @param kv - Cloudflare KV namespace
 * @returns True if first run, false otherwise
 */
export async function isFirstRun(kv: KVNamespace): Promise<boolean> {
  const state = await getState(kv);
  return state === null;
}