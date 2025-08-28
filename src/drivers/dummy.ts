import { Driver } from './Driver.js';
import EventEmitter from '../helpers/MyEventEmitter';

export type ConnectionDetails = {
	type: 'dummy',
	runQuery: (sql: string, params: any[]) => Promise<{ rows: any[] }>,
};

export class DummyDriver extends EventEmitter implements Driver {
	private readonly connectionDetails: ConnectionDetails;

	constructor(connectionDetails: ConnectionDetails) {
		super();
		this.connectionDetails = connectionDetails;
	}

	async startTransaction() {
		const cd = this.connectionDetails;
		return {
			async query(query: string, params: any[]) {
				return cd.runQuery(query, params);
			},

			async commit() {},
			async rollback() {},
		};
	}

}