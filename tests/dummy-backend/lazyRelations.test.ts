import { describe, expect, it } from 'vitest';
import { Farstorm, defineEntity, defineField, defineIdField, unwrap } from '../../src/main.js';

function createDatabase() {
	const queries: { query: string, params: unknown[] }[] = [];
	const runQuery = async (query: string, params: unknown[]) => {
		queries.push({ query, params });
		if (query.includes('from "event" where "id" = $1')) return { rows: [ { id: 1, name: 'Launch', organizer_id: 7, details_id: 3 } ] };
		if (query.includes('from "user" where "id" = any')) return { rows: [ { id: 7 } ] };
		if (query.includes('from "event_details" where "id" = any')) return { rows: [ { id: 3 } ] };
		if (query.includes('from "recap" where "event_id" = any')) return { rows: [ { id: 5, event_id: 1 } ] };
		if (query.includes('from "ticket" where "event_id" = any')) return { rows: [ { id: 11, event_id: 1 }, { id: 12, event_id: 1 } ] };
		if (query.startsWith('update "event"')) return { rows: [ { id: 1, name: 'Renamed', organizer_id: 7, details_id: 3 } ] };
		if (query.startsWith('insert into "event"')) return { rows: [ { id: 2, name: 'Copy', organizer_id: 7, details_id: 3 } ] };
		throw new Error(`Unexpected query: ${query}`);
	};

	// An event has one relation of every kind
	const db = new Farstorm({ type: 'dummy', runQuery }, {
		Event: defineEntity({
			fields: { id: defineIdField(), name: defineField('string', false) },
			manyToOne: { organizer: { entity: 'User', nullable: false } },
			oneToOneOwned: { details: { entity: 'EventDetails', nullable: false } },
			oneToOneInverse: { recap: { entity: 'Recap', inverse: 'event', nullable: true } },
			oneToMany: { tickets: { entity: 'Ticket', inverse: 'event' } },
		}),
		User: defineEntity({ fields: { id: defineIdField() } }),
		EventDetails: defineEntity({ fields: { id: defineIdField() } }),
		Recap: defineEntity({
			fields: { id: defineIdField() },
			oneToOneOwned: { event: { entity: 'Event', nullable: false } },
		}),
		Ticket: defineEntity({
			fields: { id: defineIdField() },
			manyToOne: { event: { entity: 'Event', nullable: false } },
		}),
	});

	return { db, queries, relationQueries: () => queries.filter(q => q.query.includes('= any')) };
}

// Gives anything that was started without being awaited the chance to reach the database
const settle = () => new Promise<void>(resolve => { setTimeout(resolve, 5); });

describe('Dummy backend: lazy relations', () => {
	it('does not fetch relations when an entity is spread', async () => {
		const { db, queries } = createDatabase();

		await db.inTransaction(async ({ findOne }) => {
			const event = await findOne('Event', '1');
			const copy = { ...event, name: 'Renamed' };
			await settle();

			expect(copy.name).toBe('Renamed');
			expect(queries).toHaveLength(1);
		});

		expect(queries).toHaveLength(1);
	});

	it('does not fetch relations for other ways of reading every property', async () => {
		const { db, queries } = createDatabase();

		await db.inTransaction(async ({ findOne }) => {
			const event = await findOne('Event', '1');
			Object.assign({}, event); // eslint-disable-line prefer-object-spread
			Object.values(event);
			Object.entries(event);
			JSON.stringify(event);
			const { name: _, ...rest } = event;
			await settle();

			expect(Object.keys(rest)).toEqual([ 'id', 'details', 'organizer', 'recap', 'tickets' ]);
		});

		expect(queries).toHaveLength(1);
	});

	it('saves a spread copy without fetching its relations', async () => {
		const { db, queries } = createDatabase();

		await db.inTransaction(async ({ findOne, saveOne }) => {
			const event = await findOne('Event', '1');
			const saved = await saveOne('Event', { ...event, name: 'Renamed' });
			expect(saved.name).toBe('Renamed');
		});

		expect(queries).toHaveLength(2);
		expect(queries[1].query).toBe(`update "event" set name = 'Renamed', details_id = '3', organizer_id = '7' where "id" = '1' returning *`);
	});

	it('keeps the owning relations when a spread copy is inserted as a new entity', async () => {
		const { db, queries } = createDatabase();

		await db.inTransaction(async ({ findOne, saveOne }) => {
			const event = await findOne('Event', '1');
			await saveOne('Event', { ...event, id: undefined, name: 'Copy' });
		});

		expect(queries).toHaveLength(2);
		expect(queries[1].query).toBe('insert into "event" (name, details_id, organizer_id) values ($1,$2,$3) returning *');
		expect(queries[1].params).toEqual([ 'Copy', '3', '7' ]);
	});

	it('saves a relation that was replaced on a spread copy', async () => {
		const { db, queries } = createDatabase();

		await db.inTransaction(async ({ findOne, saveOne }) => {
			const event = await findOne('Event', '1');
			await saveOne('Event', { ...event, organizer: { id: '8' } });
		});

		expect(queries).toHaveLength(2);
		expect(queries[1].query).toContain(`details_id = '3', organizer_id = '8'`);
	});

	it('accepts an unfetched relation of another entity as a relation value', async () => {
		const { db, queries } = createDatabase();

		await db.inTransaction(async ({ findOne, saveOne }) => {
			const event = await findOne('Event', '1');
			await saveOne('Event', { name: 'Copy', organizer: event.organizer, details: event.details });
		});

		expect(queries).toHaveLength(2);
		expect(queries[1].params).toEqual([ 'Copy', '3', '7' ]);
	});

	it('saves a spread copy that was made after its transaction ended', async () => {
		const { db, queries } = createDatabase();

		const event = await db.inTransaction(({ findOne }) => findOne('Event', '1'));
		const copy = { ...event, name: 'Renamed' };
		await settle();
		await db.inTransaction(({ saveOne }) => saveOne('Event', copy));

		expect(queries).toHaveLength(2);
		expect(queries[1].query).toContain(`details_id = '3', organizer_id = '7'`);
	});

	it('fetches a relation on a spread copy once it is awaited', async () => {
		const { db, relationQueries } = createDatabase();

		await db.inTransaction(async ({ findOne }) => {
			const event = await findOne('Event', '1');
			const copy = { ...event };

			expect((await copy.organizer).id).toBe('7');
			expect(relationQueries()).toHaveLength(1);

			expect((await copy.details).id).toBe('3');
			expect((await copy.recap)?.id).toBe('5');
			expect((await copy.tickets).map(ticket => ticket.id)).toEqual([ '11', '12' ]);
			expect(relationQueries()).toHaveLength(4);
		});
	});

	it('fetches a relation once, however often it is consumed', async () => {
		const { db, relationQueries } = createDatabase();

		await db.inTransaction(async ({ findOne }) => {
			const event = await findOne('Event', '1');
			const organizer = event.organizer;

			const [ first, second ] = await Promise.all([ organizer, organizer ]);
			expect(first.id).toBe('7');
			expect(second.id).toBe('7');
			expect((await organizer).id).toBe('7');
			expect((await event.organizer).id).toBe('7');
		});

		expect(relationQueries()).toHaveLength(1);
	});

	it('hands out relations that behave like promises', async () => {
		const { db } = createDatabase();

		await db.inTransaction(async ({ findOne }) => {
			const event = await findOne('Event', '1');

			expect(event.organizer).toBeInstanceOf(Promise);
			expect(await event.organizer.then(organizer => organizer.id)).toBe('7');
			expect(await event.organizer.catch(() => null)).toMatchObject({ id: '7' });

			let finallyCalled = false;
			expect(await event.organizer.finally(() => { finallyCalled = true; })).toMatchObject({ id: '7' });
			expect(finallyCalled).toBe(true);

			expect(await Promise.race([ event.tickets ])).toHaveLength(2);
			expect(await (async () => event.details)()).toMatchObject({ id: '3' });
		});
	});

	it('only fetches the requested paths in unwrap()', async () => {
		const { db, queries, relationQueries } = createDatabase();

		await db.inTransaction(async ({ findOne }) => {
			const event = await findOne('Event', '1');
			const unwrapped = await unwrap(event, [ 'organizer' ]);
			await settle();

			expect(unwrapped.organizer.id).toBe('7');
			expect(relationQueries()).toHaveLength(1);
			expect(queries[1].query).toContain('from "user"');
		});
	});

	it('rejects a relation that is first consumed after its transaction ended', async () => {
		const { db, queries } = createDatabase();

		const copy = await db.inTransaction(async ({ findOne }) => ({ ...await findOne('Event', '1') }));

		await expect(copy.organizer).rejects.toThrowError(/ORM-1000/);
		await expect(copy.tickets).rejects.toThrowError(/ORM-1000/);
		expect(queries).toHaveLength(1);
	});

	it('keeps a relation usable after its transaction ended if it was consumed in time', async () => {
		const { db } = createDatabase();

		const organizer = await db.inTransaction(async ({ findOne }) => {
			const event = await findOne('Event', '1');
			const pending = event.organizer;
			pending.catch(() => {});
			return { pending };
		});

		expect((await organizer.pending).id).toBe('7');
	});
});
