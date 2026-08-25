import { sql, Farstorm, defineEntity, defineField, defineIdField } from '../../src/main.js';
import { describe, it, expect, vi } from 'vitest';

function stitch(fn: (sqlString: string) => Promise<{ rows: any[] }>) {
	return function(sqlStringSub: string, params: any[]) {
		return fn(sqlStringSub.split(/\$\d+/).map((part, i) => part + (Array.isArray(params[i]) ? params[i].join(', ') : (params[i] || ''))).join(''));
	};
}

describe('Dummy backend: nativeQuery', () => {
	const runQuery = vi.fn();

	const db = new Farstorm({ type: 'dummy', runQuery }, {
		Item: defineEntity({
			fields: {
				id: defineIdField(),
				name: defineField('string', false),
			},
		}),
	});

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

	it('rejects database operations after their transaction has ended', async () => {
		runQuery.mockClear();
		const calls: { operation: string, execute: () => Promise<unknown> }[] = [];

		await db.inTransaction(async (functions) => {
			calls.push(
				{ operation: 'findOne', execute: () => functions.findOne('Item', '1') },
				{ operation: 'findOneOrNull', execute: () => functions.findOneOrNull('Item', '1') },
				{ operation: 'findByIds', execute: () => functions.findByIds('Item', [ '1' ]) },
				{ operation: 'findMany', execute: () => functions.findMany('Item', {}) },
				{ operation: 'count', execute: () => functions.count('Item') },
				{ operation: 'findManyAndCount', execute: () => functions.findManyAndCount('Item', {}) },
				{ operation: 'nativeQuery', execute: () => functions.nativeQuery(sql`select 1`) },
				{ operation: 'saveOne', execute: () => functions.saveOne('Item', { name: 'item' }) },
				{ operation: 'saveMany', execute: () => functions.saveMany('Item', [ { name: 'item' } ]) },
				{ operation: 'deleteByIds', execute: () => functions.deleteByIds('Item', [ '1' ]) },
				{ operation: 'deleteMany', execute: () => functions.deleteMany('Item', { where: sql`id = 1` }) },
				{ operation: 'validateSchema', execute: () => functions.validateSchema() },
			);
		});

		for (const { operation, execute } of calls) {
			await expect(execute(), operation).rejects.toThrowError(/ORM-1000/);
		}
		expect(runQuery).not.toHaveBeenCalled();
	});

	it.each([ 'findOne', 'findOneOrNull' ] as const)('rejects multiple rows from %s', async (operation) => {
		runQuery.mockReset();
		runQuery.mockResolvedValue({
			rows: [ { id: 1, name: 'first' }, { id: 1, name: 'duplicate' } ],
		});

		await db.inTransaction(async (functions) => {
			await expect(functions[operation]('Item', '1')).rejects.toThrowError(/ORM-1201/);
		});
	});

	it('rejects findByIds when the database does not return every requested row', async () => {
		runQuery.mockReset();
		runQuery.mockResolvedValue({ rows: [ { id: 1, name: 'first' } ] });

		await db.inTransaction(async ({ findByIds }) => {
			await expect(findByIds('Item', [ '1', '2' ])).rejects.toThrowError(/ORM-1202/);
		});
	});

	it('findManyAndCount accepts omitted options', async () => {
		runQuery.mockReset();
		runQuery.mockImplementation(async (query: string) => ({
			rows: query.startsWith('select count') ? [ { amount: 0 } ] : [],
		}));

		await db.inTransaction(async ({ findManyAndCount }) => {
			expect(await findManyAndCount('Item')).toEqual({ results: [], total: 0 });
		});
	});
});
