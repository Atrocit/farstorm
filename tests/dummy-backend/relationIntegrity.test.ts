import { describe, expect, it, vi } from 'vitest';
import { Farstorm, defineEntity, defineIdField } from '../../src/main.js';

function createDatabase(
	runQuery: (query: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
	options: { profileNullable?: boolean, organizerNullable?: boolean, inverseNullable?: boolean } = {},
) {
	return new Farstorm({ type: 'dummy', runQuery }, {
		User: defineEntity({
			fields: { id: defineIdField() },
			oneToOneOwned: {
				profile: { entity: 'Profile', nullable: options.profileNullable ?? false },
			},
			oneToMany: {
				events: { entity: 'Event', inverse: 'organizer' },
			},
		}),
		Profile: defineEntity({
			fields: { id: defineIdField() },
			oneToOneInverse: {
				user: { entity: 'User', inverse: 'profile', nullable: options.inverseNullable ?? false },
			},
		}),
		Event: defineEntity({
			fields: { id: defineIdField() },
			manyToOne: {
				organizer: { entity: 'User', nullable: options.organizerNullable ?? false },
			},
		}),
	});
}

describe('Dummy backend: relation integrity', () => {
	it('rejects null in a required owned one-to-one column', async () => {
		const db = createDatabase(vi.fn(async () => ({ rows: [ { id: 1, profile_id: null } ] })));

		await expect(db.inTransaction(({ findOne }) => findOne('User', '1'))).rejects.toThrowError(/ORM-1102/);
	});

	it('rejects null in a required many-to-one column', async () => {
		const db = createDatabase(vi.fn(async () => ({ rows: [ { id: 1, organizer_id: null } ] })));

		await expect(db.inTransaction(({ findOne }) => findOne('Event', '1'))).rejects.toThrowError(/ORM-1122/);
	});

	it('rejects a required owned one-to-one relation when its row is missing', async () => {
		const db = createDatabase(vi.fn(async (query) => ({
			rows: query.includes('from "user" where "id"') ? [ { id: 1, profile_id: 99 } ] : [],
		})));

		await db.inTransaction(async ({ findOne }) => {
			const user = await findOne('User', '1');
			await expect(user.profile).rejects.toThrowError(/ORM-1121/);
		});
	});

	it('returns null for a nullable owned one-to-one relation when its row is missing', async () => {
		const db = createDatabase(vi.fn(async (query) => ({
			rows: query.includes('from "user" where "id"') ? [ { id: 1, profile_id: 99 } ] : [],
		})), { profileNullable: true });

		await db.inTransaction(async ({ findOne }) => {
			const user = await findOne('User', '1');
			expect(await user.profile).toBeNull();
		});
	});

	it('rejects a required many-to-one relation when its row is missing', async () => {
		const db = createDatabase(vi.fn(async (query) => ({
			rows: query.includes('from "event" where "id"') ? [ { id: 1, organizer_id: 99 } ] : [],
		})));

		await db.inTransaction(async ({ findOne }) => {
			const event = await findOne('Event', '1');
			await expect(event.organizer).rejects.toThrowError(/ORM-1121/);
		});
	});

	it('returns null for a nullable many-to-one relation when its row is missing', async () => {
		const db = createDatabase(vi.fn(async (query) => ({
			rows: query.includes('from "event" where "id"') ? [ { id: 1, organizer_id: 99 } ] : [],
		})), { organizerNullable: true });

		await db.inTransaction(async ({ findOne }) => {
			const event = await findOne('Event', '1');
			expect(await event.organizer).toBeNull();
		});
	});

	it('rejects multiple rows for an inverse one-to-one relation', async () => {
		const db = createDatabase(vi.fn(async (query) => ({
			rows: query.includes('from "profile" where "id"')
				? [ { id: 1 } ]
				: [ { id: 2, profile_id: 1 }, { id: 3, profile_id: 1 } ],
		})));

		await db.inTransaction(async ({ findOne }) => {
			const profile = await findOne('Profile', '1');
			await expect(profile.user).rejects.toThrowError(/ORM-1100/);
		});
	});

	it('rejects a missing required inverse one-to-one relation', async () => {
		const db = createDatabase(vi.fn(async (query) => ({
			rows: query.includes('from "profile" where "id"') ? [ { id: 1 } ] : [],
		})));

		await db.inTransaction(async ({ findOne }) => {
			const profile = await findOne('Profile', '1');
			await expect(profile.user).rejects.toThrowError(/ORM-1101/);
		});
	});

	it('returns an empty list for a one-to-many relation without rows', async () => {
		const db = createDatabase(vi.fn(async (query) => ({
			rows: query.includes('from "user" where "id"') ? [ { id: 1, profile_id: 2 } ] : [],
		})));

		await db.inTransaction(async ({ findOne }) => {
			const user = await findOne('User', '1');
			expect(await user.events).toEqual([]);
		});
	});
});
