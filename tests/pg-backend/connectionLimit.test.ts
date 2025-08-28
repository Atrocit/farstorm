import { Farstorm, sql } from "../../src/main";

describe('Postgres: connectionLimit', () => {
	test.skip('should be ok opening many connections', async () => {
		const db = new Farstorm({
			type: 'postgresql',
			host: process.env['DB_HOST'] ?? 'localhost',
			port: Number(process.env['DB_PORT'] ?? '5432'),
			username: process.env['DB_USERNAME'] ?? '',
			password: process.env['DB_PASSWORD'] ?? '',
			database: process.env['DB_NAME'] ?? '',
			appName: 'farstormTests',
			ssl: false,
			poolSize: 500,
		}, {});

		// The total work here is 1000 * 250 ms + 2 queries per transaction, connection limit of 100 on my localhost means max 100 execute in parallel.
		//  The lowerbound for total execution time therefore should be (1000 / 100) * 250ms -> 2.5s
		const promises: Promise<any>[] = [];
		for (let i = 0; i < 1000; i++) {
			promises.push(db.inTransaction(async (orm) => {
				await orm.nativeQuery(sql`select 1;`);
				await new Promise(resolve => setTimeout(resolve, 250));
				await orm.nativeQuery(sql`select 1;`);
			}));
		}
		await Promise.all(promises);
	}, 15 * 1000);
});