import { describe, expect, it, vi } from 'vitest';
import { Farstorm, sql, type RowLockMode, type RowLockWait } from '../../src/main.js';
import { defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity.js';
import { OrmError } from '../../src/errors/OrmError.js';

const todoItemRow = { id: 1, description: 'Todo description' };

function setup() {
	const runQuery = vi.fn().mockResolvedValue({ rows: [ todoItemRow ] });
	const db = new Farstorm({ type: 'dummy', runQuery }, {
		'TodoItem': defineEntity({
			fields: {
				id: defineIdField(),
				description: defineField('string', false),
			},
		}),
	});

	return { db, runQuery };
}

describe('Dummy backend: row locking', () => {
	it('does not add a locking clause by default', async () => {
		const { db, runQuery } = setup();

		await db.inTransaction(async ({ findOne }) => {
			await findOne('TodoItem', '1');
		});

		expect(runQuery).toHaveBeenCalledWith('select * from "todo_item" where "id" = $1', [ '1' ]);
	});

	it.each<[RowLockMode, string]>([
		[ 'update', 'for update' ],
		[ 'noKeyUpdate', 'for no key update' ],
		[ 'share', 'for share' ],
		[ 'keyShare', 'for key share' ],
	])('maps the %s mode to %s', async (mode, clause) => {
		const { db, runQuery } = setup();

		await db.inTransaction(async ({ findOne }) => {
			await findOne('TodoItem', '1', { lock: { mode } });
		});

		expect(runQuery).toHaveBeenCalledWith(`select * from "todo_item" where "id" = $1 ${clause}`, [ '1' ]);
	});

	it.each<[RowLockWait, string]>([
		[ 'wait', 'for update' ],
		[ 'noWait', 'for update nowait' ],
		[ 'skipLocked', 'for update skip locked' ],
	])('maps the %s wait behavior to %s', async (wait, clause) => {
		const { db, runQuery } = setup();

		await db.inTransaction(async ({ findOne }) => {
			await findOne('TodoItem', '1', { lock: { mode: 'update', wait } });
		});

		expect(runQuery).toHaveBeenCalledWith(`select * from "todo_item" where "id" = $1 ${clause}`, [ '1' ]);
	});

	it('puts the lock after filtering, ordering, and pagination', async () => {
		const { db, runQuery } = setup();

		await db.inTransaction(async ({ findMany }) => {
			await findMany('TodoItem', {
				where: sql`description = ${'Todo description'}`,
				orderBy: sql`id asc`,
				offset: 1,
				limit: 2,
				lock: { mode: 'update', wait: 'skipLocked' },
			});
		});

		expect(runQuery).toHaveBeenCalledWith(
			'select * from "todo_item" where description = $1 order by id asc offset $2 limit $3 for update skip locked',
			[ 'Todo description', 1, 2 ],
		);
	});

	it('throws ORM-1203 for an unsupported lock mode', async () => {
		const { db } = setup();

		const error = await db.inTransaction(async ({ findOne }) => {
			await findOne('TodoItem', '1', { lock: { mode: 'unsupported' as RowLockMode } });
		}).catch(error => error);

		expect(error).toBeInstanceOf(OrmError);
		expect(error.message).toBe("[ORM-1203]: Unsupported row lock mode - findOne on entity 'TodoItem'");
	});

	it('throws ORM-1204 for unsupported lock wait behavior', async () => {
		const { db } = setup();

		const error = await db.inTransaction(async ({ findMany }) => {
			await findMany('TodoItem', { lock: { mode: 'update', wait: 'unsupported' as RowLockWait } });
		}).catch(error => error);

		expect(error).toBeInstanceOf(OrmError);
		expect(error.message).toBe("[ORM-1204]: Unsupported row lock wait behavior - findMany on entity 'TodoItem'");
	});
});
