import { describe, expect, it } from 'vitest';
import { Farstorm, defineEntity, defineField, defineIdField, sql } from '../../src/main.js';

const entityDefinitions = {
	User: defineEntity({
		fields: {
			id: defineIdField(),
			email: defineField('string', false),
		},
	}),
} as const;

describe('PGLite: entities with reserved table names', () => {
	async function setup(options: { auditLogging: boolean }) {
		const db = new Farstorm({ type: 'pglite' }, entityDefinitions);
		await db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`create table "user" (id bigserial primary key, email character varying not null)`);
			await nativeQuery(sql`
				create table "audit_log" (
					id bigserial primary key,
					timestamp timestamp with time zone not null,
					transaction_id bigint not null,
					"table" character varying not null,
					entity_id bigint not null,
					type character varying not null,
					diff jsonb not null,
					metadata jsonb not null
				)
			`);
		});
		if (options.auditLogging) await db.enableAuditLogging();
		return db;
	}

	for (const auditLogging of [ false, true ]) {
		describe(`with audit logging ${auditLogging ? 'enabled' : 'disabled'}`, () => {
			it('deletes an entity by ID', async () => {
				const db = await setup({ auditLogging });
				const user = await db.inTransaction(({ saveOne }) => saveOne('User', { email: 'a@example.com' }));

				const remaining = await db.inTransaction(async ({ deleteByIds, findMany }) => {
					await deleteByIds('User', [ user.id ]);
					return findMany('User', {});
				});

				expect(remaining).toEqual([]);
			});

			it('deletes entities matching a where clause', async () => {
				const db = await setup({ auditLogging });
				await db.inTransaction(({ saveMany }) => saveMany('User', [ { email: 'a@example.com' }, { email: 'b@example.com' } ]));

				const remaining = await db.inTransaction(async ({ deleteMany, findMany }) => {
					await deleteMany('User', { where: sql`email = ${'a@example.com'}` });
					return findMany('User', {});
				});

				expect(remaining.map(user => user.email)).toEqual([ 'b@example.com' ]);
			});
		});
	}

	it('writes the unquoted table name to the audit log for a delete', async () => {
		const db = await setup({ auditLogging: true });
		const user = await db.inTransaction(({ saveOne }) => saveOne('User', { email: 'a@example.com' }));

		const auditLogs = await db.inTransaction(async ({ deleteByIds, nativeQuery }) => {
			await deleteByIds('User', [ user.id ]);
			return nativeQuery(sql`select "table", entity_id::text as "entityId" from audit_log where type = 'DELETE'`);
		});

		expect(auditLogs).toEqual([ { table: 'user', entityId: user.id } ]);
	});
});
