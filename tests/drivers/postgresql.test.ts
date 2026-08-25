import { describe, expect, it, vi } from 'vitest';
import { PostgresqlDriver } from '../../src/drivers/postgresql.js';

const connectionDetails = {
	type: 'postgresql' as const,
	host: 'localhost',
	port: 5432,
	username: 'test',
	password: 'test',
	database: 'test',
	ssl: false,
	poolSize: 2,
};

describe('PostgreSQL driver', () => {
	it('configures SSL without certificate verification when SSL is enabled', () => {
		const driver = new PostgresqlDriver({ ...connectionDetails, ssl: true });
		const pool = (driver as unknown as { pool: { options: { ssl: unknown } } }).pool;

		expect(pool.options.ssl).toEqual({ rejectUnauthorized: false });
	});

	it('retries connection acquisition and starts a read-only transaction', async () => {
		const driver = new PostgresqlDriver(connectionDetails);
		const query = vi.fn().mockResolvedValue({ rows: [] });
		const release = vi.fn();
		const connect = vi.fn()
			.mockRejectedValueOnce(new Error('connection unavailable'))
			.mockResolvedValue({ query, release });
		Object.assign(driver, { pool: { connect } });

		const transaction = await driver.startTransaction({ readOnly: true });

		expect(connect).toHaveBeenCalledTimes(2);
		expect(query).toHaveBeenCalledWith('begin; set transaction read only;');

		await transaction.rollback();
		expect(query).toHaveBeenLastCalledWith('rollback');
		expect(release).toHaveBeenCalledOnce();
	});
});
