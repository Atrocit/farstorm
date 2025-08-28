import { Farstorm, InputType, OutputType, sql } from '../../src/main.js';
import { defineEntity, defineCustomField, defineField, defineIdField } from '../../src/entities/BaseEntity';

type TodoItemLevel = 'urgent' | 'normal' | 'minor';

const TodoItemSpec = defineEntity({
	fields: {
		id: defineIdField(),
		createdAt: defineField('Date', false),
		description: defineField('string', false),
		level: defineCustomField(false, (x: string) => x as TodoItemLevel, (x: TodoItemLevel) => x),
	},
	manyToOne: {
		author: { entity: 'User', nullable: false },
	},
} as const);

describe('Postgres: findOne', () => {
	async function setup() {
		const entityDefinitions = {
			'TodoItem': TodoItemSpec,
			'User': defineEntity({
				fields: {
					id: defineIdField(),
					fullName: defineField('string', false),
					username: defineField('string', false),
				},
				oneToMany: {
					todoItems: { entity: 'TodoItem', inverse: 'author' },
				},
			} as const),
		} as const;

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
		}, entityDefinitions);

		type TypeOfLevel = OutputType<typeof entityDefinitions, typeof entityDefinitions['TodoItem']>['level'];

		await db!.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`begin;`);
			await nativeQuery(sql`drop table if exists "user", "todo_item" cascade;`);

			await nativeQuery(sql`create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null)`);
			await nativeQuery(sql`create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, level character varying not null, author_id bigint not null references "user")`);
			await nativeQuery(sql`insert into "user" (full_name, username) values ('John Doe', 'john');`);
			await nativeQuery(sql`insert into "todo_item" (created_at, description, level, author_id) values ('2024-01-01T00:00:00Z', 'Todo description', 'normal', 1);`);
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
		await db.inTransaction(async ({ findOne, saveOne }) => {
			const myTodoItem = await findOne('TodoItem', '1');

			// This should work
			const myLevel: TodoItemLevel = myTodoItem.level;

			// @ts-expect-error
			myTodoItem.level = 'test';

			myTodoItem.level = 'urgent';
			const updatedTodoItem = await saveOne('TodoItem', myTodoItem);
			expect(updatedTodoItem.level).toBe('urgent');
		});
		await cleanup();
	});
});