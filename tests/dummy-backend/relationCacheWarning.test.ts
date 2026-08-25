import { describe, expect, it, vi } from 'vitest';
import { Farstorm, defineEntity, defineIdField } from '../../src/main.js';

const relationNames = Array.from({ length: 101 }, (_, index) => `children${index}`);
const childRelations = Object.fromEntries(relationNames.map(name => [ name, { entity: 'Child', inverse: 'parent' } ]));

async function runTransactionWithCacheMisses(nodeEnvironment: string) {
	const previousNodeEnvironment = process.env['NODE_ENV'];
	process.env['NODE_ENV'] = nodeEnvironment;

	try {
		const runQuery = vi.fn(async (query: string) => ({
			rows: query.includes('from "parent" where "id"') ? [ { id: 1 } ] : [],
		}));
		const db = new Farstorm({ type: 'dummy', runQuery }, {
			Parent: defineEntity({
				fields: { id: defineIdField() },
				oneToMany: childRelations,
			}),
			Child: defineEntity({
				fields: { id: defineIdField() },
				manyToOne: {
					parent: { entity: 'Parent', nullable: false },
				},
			}),
		});
		const warningListener = vi.fn();
		db.on('warning', warningListener);

		await db.inTransaction(async ({ findOne }) => {
			const parent = await findOne('Parent', '1');
			for (const relationName of relationNames) {
				await parent[relationName];
			}
		});

		return warningListener;
	} finally {
		if (previousNodeEnvironment == null) {
			delete process.env['NODE_ENV'];
		} else {
			process.env['NODE_ENV'] = previousNodeEnvironment;
		}
	}
}

describe('Dummy backend: relation cache warning', () => {
	it('warns when a transaction has more than 100 relation cache misses', async () => {
		const warningListener = await runTransactionWithCacheMisses('test');

		expect(warningListener).toHaveBeenCalledOnce();
		expect(warningListener).toHaveBeenCalledWith(expect.objectContaining({ code: 'ORM-2000' }));
	});

	it('does not emit the cache-miss warning in production', async () => {
		const warningListener = await runTransactionWithCacheMisses('production');

		expect(warningListener).not.toHaveBeenCalled();
	});
});
