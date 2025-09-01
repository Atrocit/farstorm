import { Farstorm, sql } from '../../src/main.js';
import { defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity';
import { describe, it, test, expect, vi } from 'vitest';

describe('Postgres: EventListener', () => {
	async function setup() {
		const db = new Farstorm({
			type: 'postgresql',
			host: process.env['DB_HOST'] ?? 'localhost',
			port: Number(process.env['DB_PORT'] ?? '5432'),
			username: process.env['DB_USERNAME'] ?? '',
			password: process.env['DB_PASSWORD'] ?? '',
			database: process.env['DB_NAME'] ?? '',
			appName: 'farstormTests',
			ssl: false,
			poolSize: 2,
		}, {
			'TestItem': defineEntity({
				fields: {
					id: defineIdField(),
					field1: defineField('string', false),
				},
			}),
		});

		await db!.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`begin;`);
			await nativeQuery(sql`drop table if exists "test_item" cascade;`);

			await nativeQuery(sql`create table "test_item" (id bigserial primary key, field1 character varying not null)`);
		});

		return {
			db,
			cleanup: async () => {
				await db.inTransaction(async ({ nativeQuery }) => {
					await nativeQuery(sql`drop table if exists "test_item" cascade;`);
					await nativeQuery(sql`rollback;`);
				});
			},
		};
	}


	it('beforeCommit without changes or reads', async () => {
		const { db, cleanup } = await setup();

		const beforeCommitListener1 = vi.fn();
		const beforeCommitListener2 = vi.fn();

		await db.inTransaction(async () => {}, {
			beforeCommitListeners: [ beforeCommitListener1, beforeCommitListener2 ],
		});

		expect(beforeCommitListener1).toHaveBeenCalledTimes(1);
		expect(beforeCommitListener2).toHaveBeenCalledTimes(1);

		await cleanup();
	});
});
