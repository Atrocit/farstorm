import { describe, expect, it, vi } from 'vitest';
import { Farstorm, sql } from '../../src/main.js';

describe('PGLite: transaction errors', () => {
	async function setup() {
		const db = new Farstorm({ type: 'pglite' }, {});
		const errorListener = vi.fn();
		db.on('error', errorListener);

		await db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`create table transaction_test (id bigint primary key);`);
		});

		return { db, errorListener };
	}

	it('rolls back when the transaction executor throws', async () => {
		const { db, errorListener } = await setup();
		const expectedError = new Error('executor failed');

		await expect(db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`insert into transaction_test (id) values (1);`);
			throw expectedError;
		})).rejects.toBe(expectedError);

		const rows = await db.inTransaction(({ nativeQuery }) => nativeQuery(sql`select * from transaction_test;`));
		expect(rows).toEqual([]);
		expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
			message: 'Error in transaction',
			error: expectedError,
		}));
	});

	it('reports a query error and rolls back its earlier statements', async () => {
		const { db, errorListener } = await setup();

		await expect(db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`insert into transaction_test (id) values (1);`);
			await nativeQuery(sql`select * from table_that_does_not_exist;`);
		})).rejects.toThrow();

		const rows = await db.inTransaction(({ nativeQuery }) => nativeQuery(sql`select * from transaction_test;`));
		expect(rows).toEqual([]);
		expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
			message: 'Detected query error',
			query: 'select * from table_that_does_not_exist;',
		}));
	});
});
