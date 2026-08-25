import { describe, expect, it, vi } from 'vitest';
import { Farstorm, sql } from '../../src/main.js';

describe('Postgres: transaction errors', () => {
	it('reports a query error and rolls back its earlier statements', async () => {
		const db = new Farstorm({
			type: 'postgresql',
			host: process.env['DB_HOST'] ?? 'localhost',
			port: Number(process.env['DB_PORT'] ?? '5432'),
			username: process.env['DB_USERNAME'] ?? '',
			password: process.env['DB_PASSWORD'] ?? '',
			database: process.env['DB_NAME'] ?? '',
			appName: 'farstormTests',
			ssl: false,
			poolSize: 2,
		}, {});
		const errorListener = vi.fn();
		db.on('error', errorListener);

		await db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`drop table if exists transaction_error_test;`);
			await nativeQuery(sql`create table transaction_error_test (id bigint primary key);`);
		});

		await expect(db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`insert into transaction_error_test (id) values (1);`);
			await nativeQuery(sql`select * from table_that_does_not_exist;`);
		})).rejects.toThrow();

		const rows = await db.inTransaction(async ({ nativeQuery }) => {
			const result = await nativeQuery(sql`select * from transaction_error_test;`);
			await nativeQuery(sql`drop table transaction_error_test;`);
			return result;
		});
		expect(rows).toEqual([]);
		expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({
			message: 'Detected query error',
			query: 'select * from table_that_does_not_exist;',
		}));
	});
});
