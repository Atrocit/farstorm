import { describe, it, test, expect } from 'vitest';
import { Farstorm, sql } from '../../src/main.js';
import { defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity';
import { hideRelations } from '../testHelpers';

describe('Postgres: saveOne/saveMany', () => {
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
					organizer: { entity: 'User', nullable: true },
				},
			}),
			'User': defineEntity({
				fields: {
					id: defineIdField(),
					fullName: defineField('string', true),
					username: defineField('string', true),
				},
				oneToMany: {
					organizes: { entity: 'Event', inverse: 'organizer' },
				},
			}),
		});

		await db!.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`begin;`);
			await nativeQuery(sql`drop table if exists "event", "user" cascade;`);

			await nativeQuery(sql`create table "user" (id bigserial primary key, full_name character varying, username character varying)`);
			await nativeQuery(sql`create table "event" (id bigserial primary key, name character varying not null, created_at timestamptz not null, organizer_id bigint references "user")`);
			await nativeQuery(sql`insert into "user" (full_name, username) values ('John Doe', 'john');`);
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

	it('save() creates new entity without relations', async () => {
		const { db, cleanup } = await setup();

		const event = {
			name: 'Event 1',
			createdAt: new Date('2024-01-01T00:00:00Z'),
			organizer: null,
		};
		await db.inTransaction(async ({ saveOne }) => {
			const savedEvent = await saveOne('Event', event);
			expect(savedEvent.id).not.toBeUndefined();
			expect(savedEvent.id).not.toBeNull();
			expect(savedEvent.name).toBe('Event 1');
			expect(savedEvent.createdAt).toBeInstanceOf(Date);
			expect(savedEvent.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
			expect(savedEvent.organizer).toBeNull();
		});

		await db.inTransaction(async ({ findMany }) => {
			const events = await findMany('Event', {});
			expect(events).toHaveLength(1);
			expect(events[0].name).toBe('Event 1');
			expect(events[0].createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
			expect(events[0].organizer).toBeNull();
		});

		await cleanup();
	});

	it('save() updates existing entity without relations', async () => {
		const { db, cleanup } = await setup();

		await db.inTransaction(async ({ findOne, saveOne }) => {
			// Save new event
			const newEvent = { name: 'New Event', createdAt: new Date('2024-01-01T00:00:00Z'), organizer: null };
			const savedEvent = await saveOne('Event', newEvent);

			// Update the event
			savedEvent.name = 'Updated Event';
			const updatedEvent = await saveOne('Event', savedEvent);
			expect(updatedEvent.id).toBe(savedEvent.id);
			expect(updatedEvent.name).toBe('Updated Event');

			const fetchedEvent = await findOne('Event', savedEvent.id);
			expect(fetchedEvent.name).toBe('Updated Event');
		});

		await cleanup();
	});


	it('save() updates existing entity with relations', async () => {
		const { db, cleanup } = await setup();

		await db.inTransaction(async ({ findOne, saveOne }) => {
			// Save new event
			const newEvent = { name: 'New Event', createdAt: new Date('2024-01-01T00:00:00Z'), organizer: findOne('User', '1') };
			const savedEvent = await saveOne('Event', newEvent);
			expect(savedEvent.id).not.toBeUndefined();
			expect(savedEvent.id).not.toBeNull();
			expect(savedEvent.organizer).not.toBeNull();
			const organizer = await savedEvent.organizer;
			expect(hideRelations(organizer)).toEqual({ id: '1', fullName: 'John Doe', username: 'john' });

			// Update the event without changing the organizer
			savedEvent.name = 'Updated Event';
			const updatedEvent = await saveOne('Event', savedEvent);
			expect(updatedEvent.id).toBe(savedEvent.id);
			expect(updatedEvent.name).toBe('Updated Event');
			const updatedOrganizer = await updatedEvent.organizer;
			expect(hideRelations(updatedOrganizer)).toEqual({ id: '1', fullName: 'John Doe', username: 'john' });

			// Unset the organizer
			updatedEvent.organizer = null;
			const updatedEvent2 = await saveOne('Event', updatedEvent);
			expect(updatedEvent2.id).toBe(savedEvent.id);
			expect(updatedEvent2.organizer).toBeNull();

			// Set the organizer again
			updatedEvent2.organizer = findOne('User', '1');
			const updatedEvent3 = await saveOne('Event', updatedEvent2);
			expect(updatedEvent3.id).toBe(savedEvent.id);
			expect(updatedEvent3.organizer).not.toBeNull();
			expect(hideRelations(await updatedEvent3.organizer)).toEqual({ id: '1', fullName: 'John Doe', username: 'john' });

			// Make sure the select tells us the same
			const fetchedEvent = await findOne('Event', savedEvent.id);
			expect(fetchedEvent.name).toEqual('Updated Event');
		});

		await cleanup();
	});

	it('save() of a spread copy keeps its relations without fetching them', async () => {
		const { db, cleanup } = await setup();

		const eventId = await db.inTransaction(async ({ findOne, saveOne }) => {
			const savedEvent = await saveOne('Event', { name: 'New Event', createdAt: new Date('2024-01-01T00:00:00Z'), organizer: findOne('User', '1') });
			return savedEvent.id;
		});

		await db.inTransaction(async ({ findOne, saveOne, transactionStatistics }) => {
			const event = await findOne('Event', eventId);
			const updatedEvent = await saveOne('Event', { ...event, name: 'Updated Event' });

			// One select for the event and one update, the organizer was never needed
			expect(transactionStatistics.queries.map(q => q.query.trim().split(' ')[0])).toEqual([ 'select', 'update' ]);
			expect(updatedEvent.name).toBe('Updated Event');

			// A copy can be inserted as a new entity, taking the organizer along
			const copiedEvent = await saveOne('Event', { ...event, id: undefined, name: 'Copied Event' });
			expect(copiedEvent.id).not.toBe(event.id);
			expect(transactionStatistics.queries.map(q => q.query.trim().split(' ')[0])).toEqual([ 'select', 'update', 'insert' ]);

			// The relation is still there for whoever does want it
			expect(hideRelations(await updatedEvent.organizer)).toEqual({ id: '1', fullName: 'John Doe', username: 'john' });
			expect(hideRelations(await copiedEvent.organizer)).toEqual({ id: '1', fullName: 'John Doe', username: 'john' });
		});

		await db.inTransaction(async ({ findMany }) => {
			const events = await findMany('Event', { orderBy: sql`id asc` });
			expect(events.map(e => e.name)).toEqual([ 'Updated Event', 'Copied Event' ]);
			for (const event of events) expect((await event.organizer)?.id).toBe('1');
		});

		await cleanup();
	});

	it('saveMany() can insert multiple entities in one go', async () => {
		const { db, cleanup } = await setup();

		await db.inTransaction(async ({ findOne, saveMany }) => {
			// Save new event
			const newEvent1 = { name: 'New Event 1', createdAt: new Date('2024-01-01T00:00:00Z'), organizer: findOne('User', '1') };
			const newEvent2 = { name: 'New Event 2', createdAt: new Date('2024-01-01T00:00:00Z'), organizer: findOne('User', '1') };
			const savedEvents = await saveMany('Event', [ newEvent1, newEvent2 ]);

			expect(savedEvents).toHaveLength(2);
			expect(savedEvents[0].id).not.toBeUndefined();
			expect(savedEvents[0].id).not.toBeNull();
			expect(savedEvents[1].id).not.toBeUndefined();
			expect(savedEvents[1].id).not.toBeNull();
		});
	});

	it('saveMany() can update multiple entities in one go', async () => {
		const { db, cleanup } = await setup();

		await db.inTransaction(async ({ findOne, saveMany }) => {
			const newEvent1 = { name: 'New Event 1', createdAt: new Date('2024-01-01T00:00:00Z'), organizer: findOne('User', '1') };
			const newEvent2 = { name: 'New Event 2', createdAt: new Date('2024-01-01T00:00:00Z'), organizer: findOne('User', '1') };
			const savedEvents = await saveMany('Event', [ newEvent1, newEvent2 ]);
			const resavedEvents = await saveMany('Event', savedEvents);

			expect(resavedEvents).toHaveLength(2);
			expect(resavedEvents[0].id).toBe(savedEvents[0].id);
			expect(resavedEvents[1].id).toBe(savedEvents[1].id);
		});
	});

	it('saveOne() can insert an entity with only a bigserial', async () => {
		const { db, cleanup } = await setup();

		await db.inTransaction(async ({ saveOne }) => {
			const newUser = {};
			const savedUser = await saveOne('User', newUser);
			expect(savedUser.id).not.toBeUndefined();
			expect(savedUser.id).not.toBeNull();
		});
	});

});
