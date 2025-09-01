import { describe, it, test, expect } from 'vitest';
import { Farstorm, sql } from '../../src/main.js';
import { defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity';
import { hideRelations } from '../testHelpers';

describe('Postgres: findMany', () => {
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
			'Event': defineEntity({
				fields: {
					id: defineIdField(),
					name: defineField('string', false),
					createdAt: defineField('Date', false),
				},
				manyToOne: {
					organizer: { entity: 'User', nullable: false },
				},
			}),
			'User': defineEntity({
				fields: {
					id: defineIdField(),
					fullName: defineField('string', false),
					username: defineField('string', false),
				},
				oneToMany: {
					organizes: { entity: 'Event', inverse: 'organizer' },
				},
			}),
		});

		await db!.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`begin;`);
			await nativeQuery(sql`drop table if exists "event", "user" cascade;`);

			await nativeQuery(sql`create table "user" (id bigserial primary key, full_name character varying not null, username character varying not null)`);
			await nativeQuery(sql`create table "event" (id bigserial primary key, name character varying not null, created_at timestamptz not null, organizer_id bigint not null references "user")`);
			await nativeQuery(sql`insert into "user" (full_name, username) values ('John Doe', 'john');`);
			await nativeQuery(sql`insert into "user" (full_name, username) values ('Bob Doe', 'bob');`);
			await nativeQuery(sql`insert into "event" (name, created_at, organizer_id) values ('Event 1', '2024-01-01T00:00:00Z', 1);`);
			await nativeQuery(sql`insert into "event" (name, created_at, organizer_id) values ('Event 2', '2024-01-01T00:00:00Z', 1);`);
			await nativeQuery(sql`insert into "event" (name, created_at, organizer_id) values ('Event 3', '2024-01-01T00:00:00Z', 1);`);
			await nativeQuery(sql`insert into "event" (name, created_at, organizer_id) values ('Event 4', '2024-01-01T00:00:00Z', 2);`);
		});

		return {
			db,
			cleanup: async () => {
				await db.inTransaction(async ({ nativeQuery }) => {
					await nativeQuery(sql`drop table if exists "event", "user" cascade;`);
					await nativeQuery(sql`rollback;`);
				});
			},
		};
	}

	it('findMany()', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ findMany }) => {
			const events = await findMany('Event', {});
			expect(events.map(hideRelations)).toContainEqual({ id: '1', name: 'Event 1', createdAt: new Date('2024-01-01T00:00:00Z') });
			expect(events.map(hideRelations)).toContainEqual({ id: '2', name: 'Event 2', createdAt: new Date('2024-01-01T00:00:00Z') });
			expect(events.map(hideRelations)).toContainEqual({ id: '3', name: 'Event 3', createdAt: new Date('2024-01-01T00:00:00Z') });
			expect(events.map(hideRelations)).toContainEqual({ id: '4', name: 'Event 4', createdAt: new Date('2024-01-01T00:00:00Z') });
		});
		await cleanup();
	});

	it('findMany() with where clause', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ findMany }) => {
			const events = await findMany('Event', { where: sql`organizer_id = 1` });
			expect(events.map(hideRelations)).toContainEqual({ id: '1', name: 'Event 1', createdAt: new Date('2024-01-01T00:00:00Z') });
			expect(events.map(hideRelations)).toContainEqual({ id: '2', name: 'Event 2', createdAt: new Date('2024-01-01T00:00:00Z') });
			expect(events.map(hideRelations)).toContainEqual({ id: '3', name: 'Event 3', createdAt: new Date('2024-01-01T00:00:00Z') });
			expect(events.map(hideRelations)).not.toContainEqual({ id: '4', name: 'Event 4', createdAt: new Date('2024-01-01T00:00:00Z') });
		});
		await cleanup();
	});

	it('findMany() with order by clause', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ findMany }) => {
			const events = await findMany('Event', { orderBy: sql`id desc` });
			expect(events.map(hideRelations)).toEqual([
				{ id: '4', name: 'Event 4', createdAt: new Date('2024-01-01T00:00:00Z') },
				{ id: '3', name: 'Event 3', createdAt: new Date('2024-01-01T00:00:00Z') },
				{ id: '2', name: 'Event 2', createdAt: new Date('2024-01-01T00:00:00Z') },
				{ id: '1', name: 'Event 1', createdAt: new Date('2024-01-01T00:00:00Z') },
			]);
		});
	});

	it('findMany() with limit and offset', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ findMany }) => {
			const events = await findMany('Event', { orderBy: sql`id asc`, offset: 1, limit: 2 });
			expect(events.map(hideRelations)).toEqual([
				{ id: '2', name: 'Event 2', createdAt: new Date('2024-01-01T00:00:00Z') },
				{ id: '3', name: 'Event 3', createdAt: new Date('2024-01-01T00:00:00Z') },
			]);
		});
	});
});
