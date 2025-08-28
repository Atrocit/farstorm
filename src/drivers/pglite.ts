import { Driver, TransactionControls } from './Driver.js';
import EventEmitter from '../helpers/MyEventEmitter';
import { PGlite, types } from '@electric-sql/pglite';
// @ts-ignore
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch';

export type ConnectionDetails = {
	type: 'pglite',
	database?: string,
	databasePath?: string, // leave empty to use in-memory database
	file?: any,
};

export class PgLiteDriver extends EventEmitter implements Driver {
	private pglite: PGlite;

	constructor(connectionDetails: ConnectionDetails) {
		super();
		this.pglite = new PGlite({
			loadDataDir: connectionDetails.file,
			extensions: {
				fuzzystrmatch,
			},
			parsers: {
				[types.NUMERIC]: (value) => parseFloat(value),
			},
			serializers: {
				[types.NUMERIC]: (value) => value.toString(),
			},
		});
		this.pglite._checkReady();
	}

	async startTransaction(options?: { readOnly?: boolean }): Promise<TransactionControls> {
		const self = this;

		// This is to ensure other promise chains finish before starting new transactions, to avoid deadlocks
		await new Promise(resolve => setTimeout(resolve, 0));

		return new Promise((resolve, reject) => {
			const pgliteTransaction = this.pglite.transaction<void>((tx) => {
				return new Promise((commitTransaction, rollbackTransaction) => {
					resolve({
						async query(query: string, params: any[]) {
							try {
								const result = params.length == 0 ? await tx.exec(query) : await tx.query(query, params);
								if (Array.isArray(result)) {
									return { rows: [].concat(...result.map(r => r.rows) as any) };
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
							commitTransaction();
							await Promise.allSettled([ pgliteTransaction ]);
						},
						async rollback() {
							rollbackTransaction();
							await Promise.allSettled([ pgliteTransaction ]);
						},
					});
				});
			}).catch(e => reject(e));
		});
	}
}