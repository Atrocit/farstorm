import { describe, it, test, expect } from 'vitest';
import { Farstorm, SchemaValidationResult, sql } from '../../src/main.js';
import { BaseEntity, defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity';

const entitySchema = {
	'TodoItem': defineEntity({
		fields: {
			id: defineIdField(),
			createdAt: defineField('Date', false),
			description: defineField('string', false),
		},
		oneToOneInverse: {
			favoriteOfUser: { entity: 'User', inverse: 'favoriteTodo', nullable: true },
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
		oneToOneOwned: {
			favoriteTodo: { entity: 'TodoItem', nullable: true },
		},
		oneToMany: {
			todoItems: { entity: 'TodoItem', inverse: 'author' },
		},
	}),
} as const;

describe('Postgres: validateSchema', () => {
	async function runValidationAgainstSchema<T extends Record<string, BaseEntity>>(createSchema: string, cleanupSchema: string, myEntitySchema: T, schemaName?: string): Promise<SchemaValidationResult> {
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
		}, myEntitySchema);

		return db.inTransaction(async ({ nativeQuery, validateSchema }) => {
			await nativeQuery({ sql: cleanupSchema, params: [] });
			await nativeQuery({ sql: createSchema, params: [] });

			const result = await validateSchema(schemaName);

			await nativeQuery({ sql: cleanupSchema, params: [] });
			await nativeQuery(sql`rollback;`);

			return result;
		});
	}

	it('should validate a valid schema', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint references "todo_item";
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(true);
	});

	it('should validate a valid schema against public schema', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint references "todo_item";
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema, 'public');
		expect(result.valid).toBe(true);
	});

	it('should fail to validate a valid schema against different schema', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint references "todo_item";
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema, 'test');
		expect(result.valid).toBe(false);
	});

	it('should error when missing tables', async () => {
		const result = await runValidationAgainstSchema(``, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.errors.map(e => e.code)).toContain('ORM-SV-3000');
	});

	it('should error when missing columns for regular fields', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint references "todo_item";
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.errors).toHaveLength(1);
		expect(result.errors.map(e => e.code)).toContain('ORM-SV-3001');
	});

	it('should error when missing columns for one-to-one relation fields', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.errors).toHaveLength(2);
		expect(result.errors.map(e => e.code)).toContain('ORM-SV-3100');
		expect(result.errors.map(e => e.code)).toContain('ORM-SV-3110');
	});

	it('should error when missing columns for many-to-one relation fields', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null);
			alter table "user" add column favorite_todo_id bigint references "todo_item";
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.errors).toHaveLength(2);
		expect(result.errors.map(e => e.code)).toContain('ORM-SV-3120');
		expect(result.errors.map(e => e.code)).toContain('ORM-SV-3130');
	});

	it('should error when column in db is not nullable, but one-to-one relation is nullable', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint not null references "todo_item";
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.errors.map(e => e.code)).toContain('ORM-SV-3101');
	});

	it('should error when missing columns for many-to-one relation fields', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint references "todo_item";
		`, `drop table if exists "user", "todo_item" cascade;`, {
			...entitySchema,
			'TodoItem': {
				...entitySchema['TodoItem'],
				manyToOne: {
					author: { entity: 'User', nullable: true },
				},
			},
		});
		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.errors).toHaveLength(1);
		expect(result.errors.map(e => e.code)).toContain('ORM-SV-3121');
	});

	it('give a warning when indexes are missing but a one-to-many is defined', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint references "todo_item";
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(true);
		expect(result.warnings.map(w => w.code)).toContain('ORM-SV-3133');
	});

	it('not give a warning when indexes are there and a one-to-many is defined', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint references "todo_item";
			create index on "todo_item" (author_id);
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(true);
		expect(result.warnings.map(w => w.code)).not.toContain('ORM-SV-3133');
	});

	it('give a warning when indexes are missing but a one-to-one-inverse is defined', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint references "todo_item";
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(true);
		expect(result.warnings.map(w => w.code)).toContain('ORM-SV-3113');
	});

	it('not give a warning when indexes are there and a one-to-one-inverse is defined', async () => {
		const result = await runValidationAgainstSchema(`
			create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null);
			create table "todo_item" (id bigserial primary key, created_at timestamptz not null, description character varying not null, author_id bigint not null references "user");
			alter table "user" add column favorite_todo_id bigint references "todo_item";
			create index on "user" (favorite_todo_id);
		`, `drop table if exists "user", "todo_item" cascade;`, entitySchema);
		expect(result.valid).toBe(true);
		expect(result.warnings.map(w => w.code)).not.toContain('ORM-SV-3113');
	});

});
