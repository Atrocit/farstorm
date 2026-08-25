import { describe, expect, it, vi } from 'vitest';
import { Farstorm, defineEntity, defineIdField } from '../../src/main.js';

describe('Dummy backend: cache invalidation', () => {
	it('refreshes a same-entity inverse relation after an insert', async () => {
		let inserted = false;
		let relationQueries = 0;
		const runQuery = vi.fn(async (query: string) => {
			if (query.includes('from "node" where "id" = $1')) return { rows: [ { id: 1, parent_id: null } ] };
			if (query.includes('from "node" where "parent_id" = any')) {
				relationQueries++;
				return { rows: inserted ? [ { id: 2, parent_id: 1 } ] : [] };
			}
			if (query.startsWith('insert into "node"')) {
				inserted = true;
				return { rows: [ { id: 2, parent_id: 1 } ] };
			}
			throw new Error(`Unexpected query: ${query}`);
		});
		const db = new Farstorm({ type: 'dummy', runQuery }, {
			Node: defineEntity({
				fields: { id: defineIdField() },
				manyToOne: {
					parent: { entity: 'Node', nullable: true },
				},
				oneToMany: {
					children: { entity: 'Node', inverse: 'parent' },
				},
			}),
		});

		await db.inTransaction(async ({ findOne, saveOne }) => {
			const parent = await findOne('Node', '1');
			expect(await parent.children).toEqual([]);

			await saveOne('Node', { parent });

			expect((await parent.children).map(child => child.id)).toEqual([ '2' ]);
		});

		expect(relationQueries).toBe(2);
	});

	it('refreshes a same-entity owned relation after an update', async () => {
		let relationQueries = 0;
		const runQuery = vi.fn(async (query: string) => {
			if (query.includes('from "child" where "id" = $1')) return { rows: [ { id: 2, parent_id: 1 } ] };
			if (query.includes('from "parent" where "id" = any')) {
				relationQueries++;
				return { rows: [ { id: 1 } ] };
			}
			if (query.startsWith('update "child"')) return { rows: [ { id: 2, parent_id: 1 } ] };
			throw new Error(`Unexpected query: ${query}`);
		});
		const db = new Farstorm({ type: 'dummy', runQuery }, {
			Parent: defineEntity({
				fields: { id: defineIdField() },
				oneToMany: {
					children: { entity: 'Child', inverse: 'parent' },
				},
			}),
			Child: defineEntity({
				fields: { id: defineIdField() },
				manyToOne: {
					parent: { entity: 'Parent', nullable: false },
				},
			}),
		});

		await db.inTransaction(async ({ findOne, saveOne }) => {
			const child = await findOne('Child', '2');
			const parent = await child.parent;
			const savedChild = await saveOne('Child', { id: child.id, parent });

			expect((await savedChild.parent).id).toBe('1');
		});

		expect(relationQueries).toBe(2);
	});
});
