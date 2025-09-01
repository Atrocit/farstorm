import { sql, Farstorm } from '../../src/main.js';
import { describe, it, test, expect, vi } from 'vitest';

function stitch(fn: (sqlString: string) => Promise<{ rows: any[] }>) {
	return function(sqlStringSub: string, params: any[]) {
		return fn(sqlStringSub.split(/\$\d+/).map((part, i) => part + (Array.isArray(params[i]) ? params[i].join(', ') : (params[i] || ''))).join(''));
	};
}

describe('Dummy backend: nativeQuery', () => {
	const runQuery = vi.fn();

	const db = new Farstorm({ type: 'dummy', runQuery }, {});

	it('should execute the query exactly as specified and get a result exactly as specified', async () => {
		await db.inTransaction(async ({ nativeQuery }) => {
			const queries: string[] = [];
			runQuery.mockImplementation(stitch(async (sqlString) => {
				queries.push(sqlString);
				if (sqlString == 'select * from "todo_item" where "id" = 1') return { rows: [ { id: 1, created_at: new Date('2024-01-01T00:00:00Z'), description: 'Todo description', author_id: 2, approver_id: null } ] };
				return { rows: [] };
			}));
			const todoItem = await nativeQuery(sql`select * from "todo_item" where "id" = ${1}`);
			expect(queries).toContain('select * from "todo_item" where "id" = 1');
			expect(todoItem).toEqual([ { id: 1, created_at: new Date('2024-01-01T00:00:00Z'), description: 'Todo description', author_id: 2, approver_id: null } ]);
		});
	});
});
