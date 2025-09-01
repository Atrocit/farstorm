import { describe, it, test, expect } from 'vitest';
import { Farstorm, sql } from '../../src/main.js';
import { defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity';
import { hideRelations } from '../testHelpers';

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

	it('should select a single entity', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ findOne }) => {
			const todoItem = await findOne('TodoItem', '1');
			expect(hideRelations(todoItem)).toEqual({ id: '1', createdAt: new Date('2024-01-01T00:00:00Z'), description: 'Todo description' });
			expect(todoItem.createdAt).toBeInstanceOf(Date);
		});
		await cleanup();
	});

	it('should return a single record with fetchable relations', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ findOne }) => {
			const todoItem = await findOne('TodoItem', '1');
			const author = await todoItem.author;
			expect(hideRelations(author)).toEqual({ id: '1', fullName: 'John Doe', username: 'john' });
		});
		await cleanup();
	});
});
