import { describe, expect, it, vi } from 'vitest';
import { Farstorm } from '../../src/main.js';

describe('Dummy backend: transaction cleanup', () => {
	it('retries rollback during final cleanup when the first rollback fails', async () => {
		const db = new Farstorm({
			type: 'dummy',
			runQuery: vi.fn(async () => ({ rows: [] })),
		}, {});
		const rollbackError = new Error('rollback failed');
		const rollback = vi.fn()
			.mockRejectedValueOnce(rollbackError)
			.mockResolvedValueOnce(undefined);
		Object.assign(db, {
			driver: {
				startTransaction: vi.fn(async () => ({
					query: vi.fn(async () => ({ rows: [] })),
					commit: vi.fn(async () => undefined),
					rollback,
				})),
			},
		});
		db.on('error', vi.fn());
		const executorError = new Error('executor failed');

		await expect(db.inTransaction(async () => {
			throw executorError;
		})).rejects.toBe(rollbackError);

		expect(rollback).toHaveBeenCalledTimes(2);
	});
});
