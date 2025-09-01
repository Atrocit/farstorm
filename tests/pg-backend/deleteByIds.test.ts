import { describe, it, test, expect } from 'vitest';
import { Farstorm, sql } from '../../src/main.js';
import { defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity';

describe('Postgres: findOne', () => {
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
			'TodoItem': defineEntity({
				fields: {
					id: defineIdField(),
					createdAt: defineField('Date', false),
					description: defineField('string', false),
				},
				manyToOne: {
					author: { entity: 'User', nullable: false },
				},
			}),
			'User': defineEntity({
				fields: {
					id: defineIdField(),
					fullName: defineField('string', false),
					username: defineField('string', false),
				},
				oneToMany: {
					todoItems: { entity: 'TodoItem', inverse: 'author' },
				},
			}),
		});

		await db!.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`begin;`);
			await nativeQuery(sql`drop table if exists "user", "todo_item" cascade;`);

			await nativeQuery(sql`create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null)`);
			await nativeQuery(sql`create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user")`);
			await nativeQuery(sql`insert into "user" (full_name, username) values ('John Doe', 'john');`);
			await nativeQuery(sql`insert into "todo_item" (created_at, description, author_id) values ('2024-01-01T00:00:00Z', 'Todo description', 1);`);
		});

		return {
			db,
			cleanup: async () => {
				await db.inTransaction(async ({ nativeQuery }) => {
					await nativeQuery(sql`drop table if exists "user", "todo_item" cascade;`);
					await nativeQuery(sql`rollback;`);
				});
			},
		};
	}

	it('should delete an entity', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ deleteByIds, findMany }) => {
			await deleteByIds('TodoItem', [ '1' ]);
			const todoItems = await findMany('TodoItem', {});
			expect(todoItems).toHaveLength(0);
		});
		await cleanup();
	});

	it('should remove deleted entities from cache', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ findOne, deleteByIds }) => {
			const author = await findOne('User', '1');
			expect(await author.todoItems).toHaveLength(1);

			await deleteByIds('TodoItem', [ '1' ]);
			expect(await author.todoItems).toHaveLength(0);
		});
		await cleanup();
	});

	it('calling deleteByIds with empty array as argument should do nothing', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ deleteByIds, findMany }) => {
			await deleteByIds('TodoItem', []);
			const todoItems = await findMany('TodoItem', {});
			expect(todoItems).toHaveLength(1);
		});
		await cleanup();
	});
});
