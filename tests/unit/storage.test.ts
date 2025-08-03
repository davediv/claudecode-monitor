/**
 * Unit tests for KV storage operations module
 * Tests all CRUD operations, error scenarios, and state initialization
 */

import {
	getState,
	setState,
	initializeState,
	isFirstRun,
	updateNotificationTime,
	clearState,
	STORAGE_KEY,
	STATE_TTL,
} from '../../src/storage';
import { ErrorCode } from '../../src/types/models';
import { WorkerError } from '../../src/types';
import type { StorageState } from '../../src/types/models';

// Mock the utils module
jest.mock('../../src/utils', () => ({
	measureTime: jest.fn(async (fn) => fn()),
	logError: jest.fn(),
}));

describe('KV Storage Operations', () => {
	let mockKV: jest.Mocked<KVNamespace>;
	
	beforeEach(() => {
		// Create a fresh mock KV namespace for each test
		mockKV = {
			get: jest.fn(),
			put: jest.fn(),
			delete: jest.fn(),
			list: jest.fn(),
			getWithMetadata: jest.fn(),
		} as any;
		
		// Clear all mocks
		jest.clearAllMocks();
		
		// Mock console methods to reduce noise
		jest.spyOn(console, 'log').mockImplementation();
		jest.spyOn(console, 'warn').mockImplementation();
		jest.spyOn(console, 'error').mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('getState', () => {
		const validState: StorageState = {
			lastVersion: '1.0.0',
			lastCheckTime: '2024-01-15T10:00:00Z',
			lastNotificationTime: '2024-01-15T10:30:00Z',
		};

		it('should retrieve valid state from KV', async () => {
			mockKV.get.mockResolvedValueOnce(validState);
			
			const result = await getState(mockKV);
			
			expect(result).toEqual(validState);
			expect(mockKV.get).toHaveBeenCalledWith(STORAGE_KEY, 'json');
			expect(mockKV.get).toHaveBeenCalledTimes(1);
		});

		it('should return null when no state exists', async () => {
			mockKV.get.mockResolvedValueOnce(null);
			
			const result = await getState(mockKV);
			
			expect(result).toBeNull();
			expect(mockKV.get).toHaveBeenCalledWith(STORAGE_KEY, 'json');
		});

		it('should validate state structure and throw on invalid data', async () => {
			const invalidState = { invalid: 'data' };
			mockKV.get.mockResolvedValueOnce(invalidState);
			
			await expect(getState(mockKV)).rejects.toThrow(WorkerError);
			await expect(getState(mockKV)).rejects.toThrow('Invalid state data structure');
		});

		it('should handle state without optional lastNotificationTime', async () => {
			const stateWithoutNotification: StorageState = {
				lastVersion: '1.0.0',
				lastCheckTime: '2024-01-15T10:00:00Z',
			};
			mockKV.get.mockResolvedValueOnce(stateWithoutNotification);
			
			const result = await getState(mockKV);
			
			expect(result).toEqual(stateWithoutNotification);
			expect(result?.lastNotificationTime).toBeUndefined();
		});

		it('should retry on failure with exponential backoff', async () => {
			const error = new Error('KV error');
			mockKV.get
				.mockRejectedValueOnce(error)
				.mockRejectedValueOnce(error)
				.mockResolvedValueOnce(validState);
			
			const result = await getState(mockKV, 2);
			
			expect(result).toEqual(validState);
			expect(mockKV.get).toHaveBeenCalledTimes(3);
			expect(setTimeout).toHaveBeenCalledTimes(2);
		});

		it('should throw WorkerError after all retries fail', async () => {
			const error = new Error('KV error');
			mockKV.get.mockRejectedValue(error);
			
			await expect(getState(mockKV, 1)).rejects.toThrow(WorkerError);
			await expect(getState(mockKV, 1)).rejects.toThrow('Failed to retrieve state from KV after 2 attempts');
			expect(mockKV.get).toHaveBeenCalledTimes(2);
		});

		it('should re-throw existing WorkerError', async () => {
			const workerError = new WorkerError('Custom error', ErrorCode.STORAGE_ERROR);
			mockKV.get.mockRejectedValue(workerError);
			
			await expect(getState(mockKV, 0)).rejects.toThrow(workerError);
			expect(mockKV.get).toHaveBeenCalledTimes(1);
		});

		describe('Invalid state validation', () => {
			const invalidStates = [
				{ lastVersion: 123, lastCheckTime: '2024-01-15' }, // Invalid version type
				{ lastVersion: '1.0.0', lastCheckTime: 123 }, // Invalid time type
				{ lastVersion: '1.0.0' }, // Missing required field
				{ lastCheckTime: '2024-01-15' }, // Missing required field
				'not an object', // Not an object
				null, // Null
				[], // Array
			];

			invalidStates.forEach((invalidState, index) => {
				it(`should reject invalid state format ${index + 1}`, async () => {
					mockKV.get.mockResolvedValueOnce(invalidState);
					
					await expect(getState(mockKV)).rejects.toThrow(WorkerError);
					await expect(getState(mockKV)).rejects.toThrow('Invalid state data structure');
				});
			});
		});
	});

	describe('setState', () => {
		const validState: StorageState = {
			lastVersion: '1.0.0',
			lastCheckTime: '2024-01-15T10:00:00Z',
			lastNotificationTime: '2024-01-15T10:30:00Z',
		};

		it('should store valid state in KV with TTL', async () => {
			mockKV.put.mockResolvedValueOnce(undefined);
			
			await setState(mockKV, validState);
			
			expect(mockKV.put).toHaveBeenCalledWith(
				STORAGE_KEY,
				JSON.stringify(validState),
				expect.objectContaining({
					expirationTtl: STATE_TTL,
					metadata: expect.objectContaining({
						version: '1.0.0',
						updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
					}),
				})
			);
			expect(mockKV.put).toHaveBeenCalledTimes(1);
		});

		it('should validate state before storing', async () => {
			const invalidState = { invalid: 'data' } as any;
			
			await expect(setState(mockKV, invalidState)).rejects.toThrow(WorkerError);
			await expect(setState(mockKV, invalidState)).rejects.toThrow('Invalid state data provided');
			expect(mockKV.put).not.toHaveBeenCalled();
		});

		it('should retry on failure with exponential backoff', async () => {
			const error = new Error('KV error');
			mockKV.put
				.mockRejectedValueOnce(error)
				.mockRejectedValueOnce(error)
				.mockResolvedValueOnce(undefined);
			
			await setState(mockKV, validState, 2);
			
			expect(mockKV.put).toHaveBeenCalledTimes(3);
			expect(setTimeout).toHaveBeenCalledTimes(2);
		});

		it('should throw WorkerError after all retries fail', async () => {
			const error = new Error('KV error');
			mockKV.put.mockRejectedValue(error);
			
			await expect(setState(mockKV, validState, 1)).rejects.toThrow(WorkerError);
			await expect(setState(mockKV, validState, 1)).rejects.toThrow('Failed to update state in KV after 2 attempts');
			expect(mockKV.put).toHaveBeenCalledTimes(2);
		});

		it('should store state without optional lastNotificationTime', async () => {
			const stateWithoutNotification: StorageState = {
				lastVersion: '2.0.0',
				lastCheckTime: '2024-01-16T10:00:00Z',
			};
			mockKV.put.mockResolvedValueOnce(undefined);
			
			await setState(mockKV, stateWithoutNotification);
			
			expect(mockKV.put).toHaveBeenCalledWith(
				STORAGE_KEY,
				JSON.stringify(stateWithoutNotification),
				expect.any(Object)
			);
		});
	});

	describe('initializeState', () => {
		it('should create and store initial state', async () => {
			const version = '1.0.0';
			mockKV.put.mockResolvedValueOnce(undefined);
			
			const result = await initializeState(mockKV, version);
			
			expect(result).toMatchObject({
				lastVersion: version,
				lastCheckTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
			});
			expect(result.lastNotificationTime).toBeUndefined();
			expect(mockKV.put).toHaveBeenCalledTimes(1);
		});

		it('should validate version parameter', async () => {
			await expect(initializeState(mockKV, '')).rejects.toThrow(WorkerError);
			await expect(initializeState(mockKV, '')).rejects.toThrow('Invalid version provided');
			
			await expect(initializeState(mockKV, null as any)).rejects.toThrow(WorkerError);
			await expect(initializeState(mockKV, 123 as any)).rejects.toThrow(WorkerError);
			
			expect(mockKV.put).not.toHaveBeenCalled();
		});

		it('should re-throw WorkerError from setState', async () => {
			const error = new WorkerError('Storage error', ErrorCode.STORAGE_ERROR);
			mockKV.put.mockRejectedValue(error);
			
			await expect(initializeState(mockKV, '1.0.0')).rejects.toThrow(error);
		});

		it('should wrap non-WorkerError exceptions', async () => {
			const error = new Error('Generic error');
			mockKV.put.mockRejectedValue(error);
			
			await expect(initializeState(mockKV, '1.0.0')).rejects.toThrow(WorkerError);
			await expect(initializeState(mockKV, '1.0.0')).rejects.toThrow('Failed to initialize state');
		});
	});

	describe('isFirstRun', () => {
		it('should return true when no state exists', async () => {
			mockKV.get.mockResolvedValueOnce(null);
			
			const result = await isFirstRun(mockKV);
			
			expect(result).toBe(true);
			expect(mockKV.get).toHaveBeenCalledWith(STORAGE_KEY, 'json');
		});

		it('should return false when state exists', async () => {
			const validState: StorageState = {
				lastVersion: '1.0.0',
				lastCheckTime: '2024-01-15T10:00:00Z',
			};
			mockKV.get.mockResolvedValueOnce(validState);
			
			const result = await isFirstRun(mockKV);
			
			expect(result).toBe(false);
		});

		it('should return true for invalid state data', async () => {
			const invalidState = { invalid: 'data' };
			mockKV.get.mockResolvedValueOnce(invalidState);
			
			const result = await isFirstRun(mockKV);
			
			expect(result).toBe(true);
			expect(console.warn).toHaveBeenCalledWith('Invalid state data found, treating as first run');
		});

		it('should re-throw non-storage errors', async () => {
			const error = new Error('Network error');
			mockKV.get.mockRejectedValue(error);
			
			await expect(isFirstRun(mockKV)).rejects.toThrow(WorkerError);
		});

		it('should not retry on getState call', async () => {
			mockKV.get.mockRejectedValueOnce(new Error('KV error'));
			
			await expect(isFirstRun(mockKV)).rejects.toThrow();
			expect(mockKV.get).toHaveBeenCalledTimes(1); // No retries
		});
	});

	describe('updateNotificationTime', () => {
		const existingState: StorageState = {
			lastVersion: '1.0.0',
			lastCheckTime: '2024-01-15T10:00:00Z',
		};

		it('should update notification time in existing state', async () => {
			const notificationTime = '2024-01-15T11:00:00Z';
			mockKV.get.mockResolvedValueOnce(existingState);
			mockKV.put.mockResolvedValueOnce(undefined);
			
			await updateNotificationTime(mockKV, notificationTime);
			
			expect(mockKV.put).toHaveBeenCalledWith(
				STORAGE_KEY,
				JSON.stringify({
					...existingState,
					lastNotificationTime: notificationTime,
				}),
				expect.any(Object)
			);
		});

		it('should throw error when no state exists', async () => {
			mockKV.get.mockResolvedValueOnce(null);
			
			await expect(updateNotificationTime(mockKV, '2024-01-15T11:00:00Z')).rejects.toThrow(WorkerError);
			await expect(updateNotificationTime(mockKV, '2024-01-15T11:00:00Z')).rejects.toThrow('Cannot update notification time: no state exists');
			expect(mockKV.put).not.toHaveBeenCalled();
		});

		it('should preserve all existing state fields', async () => {
			const stateWithNotification: StorageState = {
				lastVersion: '2.0.0',
				lastCheckTime: '2024-01-16T10:00:00Z',
				lastNotificationTime: '2024-01-16T10:30:00Z',
			};
			const newNotificationTime = '2024-01-16T12:00:00Z';
			
			mockKV.get.mockResolvedValueOnce(stateWithNotification);
			mockKV.put.mockResolvedValueOnce(undefined);
			
			await updateNotificationTime(mockKV, newNotificationTime);
			
			const putCall = mockKV.put.mock.calls[0];
			const storedState = JSON.parse(putCall[1] as string);
			
			expect(storedState).toEqual({
				...stateWithNotification,
				lastNotificationTime: newNotificationTime,
			});
		});

		it('should handle getState errors', async () => {
			const error = new Error('KV error');
			mockKV.get.mockRejectedValue(error);
			
			await expect(updateNotificationTime(mockKV, '2024-01-15T11:00:00Z')).rejects.toThrow(WorkerError);
		});

		it('should handle setState errors', async () => {
			mockKV.get.mockResolvedValueOnce(existingState);
			mockKV.put.mockRejectedValue(new Error('KV error'));
			
			await expect(updateNotificationTime(mockKV, '2024-01-15T11:00:00Z')).rejects.toThrow(WorkerError);
		});
	});

	describe('clearState', () => {
		it('should delete state from KV', async () => {
			mockKV.delete.mockResolvedValueOnce(undefined);
			
			await clearState(mockKV);
			
			expect(mockKV.delete).toHaveBeenCalledWith(STORAGE_KEY);
			expect(mockKV.delete).toHaveBeenCalledTimes(1);
		});

		it('should throw WorkerError on deletion failure', async () => {
			const error = new Error('KV error');
			mockKV.delete.mockRejectedValue(error);
			
			await expect(clearState(mockKV)).rejects.toThrow(WorkerError);
			await expect(clearState(mockKV)).rejects.toThrow('Failed to clear state from KV');
		});

		it('should log successful deletion', async () => {
			mockKV.delete.mockResolvedValueOnce(undefined);
			
			await clearState(mockKV);
			
			expect(console.log).toHaveBeenCalledWith('State cleared from KV storage');
		});

		it('should include error details in WorkerError', async () => {
			const originalError = new Error('Permission denied');
			mockKV.delete.mockRejectedValue(originalError);
			
			try {
				await clearState(mockKV);
				fail('Should have thrown an error');
			} catch (error) {
				expect(error).toBeInstanceOf(WorkerError);
				const workerError = error as WorkerError;
				expect(workerError.code).toBe(ErrorCode.STORAGE_ERROR);
				expect(workerError.details).toMatchObject({ originalError });
			}
		});
	});

	describe('Error scenarios and edge cases', () => {
		it('should handle KV namespace being undefined', async () => {
			await expect(getState(undefined as any)).rejects.toThrow();
			await expect(setState(undefined as any, {} as any)).rejects.toThrow();
		});

		it('should handle concurrent operations', async () => {
			const validState: StorageState = {
				lastVersion: '1.0.0',
				lastCheckTime: '2024-01-15T10:00:00Z',
			};
			
			mockKV.get.mockResolvedValue(validState);
			mockKV.put.mockResolvedValue(undefined);
			
			// Simulate concurrent operations
			const operations = Promise.all([
				getState(mockKV),
				getState(mockKV),
				setState(mockKV, validState),
				setState(mockKV, validState),
			]);
			
			await expect(operations).resolves.toBeDefined();
			expect(mockKV.get).toHaveBeenCalledTimes(2);
			expect(mockKV.put).toHaveBeenCalledTimes(2);
		});

		it('should handle very large state objects', async () => {
			const largeState: StorageState = {
				lastVersion: '1.0.0'.repeat(100),
				lastCheckTime: '2024-01-15T10:00:00Z',
				lastNotificationTime: '2024-01-15T10:30:00Z',
			};
			
			mockKV.put.mockResolvedValueOnce(undefined);
			
			await setState(mockKV, largeState);
			
			expect(mockKV.put).toHaveBeenCalledWith(
				STORAGE_KEY,
				expect.stringContaining(largeState.lastVersion),
				expect.any(Object)
			);
		});
	});
});