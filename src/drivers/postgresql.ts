import { Pool, types } from 'pg';
import { Driver, TransactionControls } from './Driver.js';
import EventEmitter from '../helpers/MyEventEmitter';

export type ConnectionDetails = {
	type: 'postgresql',
	host: string,
	port: number,
	username: string,
	password: string,
	database: string,
	ssl: boolean,
	poolSize: number,
	appName?: string,
};

// Parse bigint in PostgreSQL as number in JS. This will fail for any integer larger than 2^53, but that's a problem for another day
types.setTypeParser(20, (value) => parseInt(value, 10));

// Parse timestamp and timestamptz into a Date object
types.setTypeParser(1114, (value) => new Date(value));
types.setTypeParser(1184, (value) => new Date(value));

// To not lose precision, postgres will return numeric types with precision as string
// This will parse them into numbers
// The drawback is that we might lose precision for some numbers, but that's a problem for another day
types.setTypeParser(1700, (value) => parseFloat(value));

export class PostgresqlDriver extends EventEmitter implements Driver {
	private pool: Pool;
	private successfullyConnected: boolean = false;

	constructor(connectionDetails: ConnectionDetails) {
		super();
		this.pool = new Pool({
			user: connectionDetails.username,
			password: connectionDetails.password,
			host: connectionDetails.host,
			database: connectionDetails.database,
			port: connectionDetails.port,
			ssl: connectionDetails.ssl ? { rejectUnauthorized: false } : false,
			application_name: connectionDetails.appName,
			connectionTimeoutMillis: 0,
			idleTimeoutMillis: 500, // should be relatively aggressive
			min: 1,
			max: connectionDetails.poolSize,
			allowExitOnIdle: true,
		});

		this.pool.on('error', (err) => {
			this.emit('error', {
				message: 'Unexpected error on PostgreSQL connection',
				error: err,
			});
		});
	}

	async startTransaction(options?: { readOnly?: boolean }): Promise<TransactionControls> {
		const self = this;

		// This is to ensure other promise chains finish before starting new transactions, to avoid deadlocks
		await new Promise(resolve => setTimeout(resolve, 0));

		// This checks and makes sure to warn/error if we cannot connect to the database in a reasonable time frame
		const connectionTimeout = 30;
		const connectionTimeoutListener = setTimeout(() => {
			if (!this.successfullyConnected) {
				this.emit('error', { message: `Connection timeout while trying to connect to database on initial connection, exiting...` });
				process.exit(1);
			} else {
				this.emit('warning', { message: `Acquiring database connection took more than ${connectionTimeout} seconds, check if the pool size is sufficient for the work load.` });
			}
		}, connectionTimeout * 1000);

		// Request the connection
		const reconnectionAttempts = 10;
		const timeoutFirstRetryMs = 10;
		const client = await (async () => {
			let lastError: any;
			for (let i = 0; i < reconnectionAttempts; i++) {
				try {
					return await this.pool.connect();
				} catch (e: any) {
					lastError = e;
					await new Promise(resolve => setTimeout(resolve, Math.pow(i, 2) * timeoutFirstRetryMs));
				}
			}
			throw lastError;
		})();
		clearTimeout(connectionTimeoutListener);
		this.successfullyConnected = true;

		await client.query((options?.readOnly ?? false) ? 'begin; set transaction read only;' : 'begin;');

		return {
			async query(query: string, params: any[]) {
				try {
					const result = await client.query(query, params);
					if (Array.isArray(result)) {
						return { rows: [].concat(...result.map(r => r.rows)) };
					} else {
						return { rows: result.rows };
					}
				} catch (e) {
					self.emit('error', {
						message: 'Detected query error',
						error: e,
						query,
					});
					throw e;
				}
			},
			async commit() {
				await client.query('commit');
				client.release();
			},
			async rollback() {
				await client.query('rollback');
				client.release();
			},
		};
	}
}