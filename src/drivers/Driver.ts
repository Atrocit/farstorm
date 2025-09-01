import EventEmitter from '../helpers/MyEventEmitter.js';

export interface Driver extends EventEmitter {
	startTransaction(options?: { readOnly?: boolean }): Promise<TransactionControls>;
}

export interface TransactionControls {
	query(query: string, params: any[]): Promise<{ rows: any[] }>;
	commit(): Promise<void>;
	rollback(): Promise<void>;
}
