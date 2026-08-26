import { describe, expect, it, vi } from 'vitest';
import { Farstorm, InputType, defineEntity, defineField, defineIdField } from '../../src/main.js';

const entityDefinitions = {
	User: defineEntity({
		fields: {
			id: defineIdField(),
			name: defineField('string', false),
		},
		oneToOneOwned: {
			profile: { entity: 'Profile', nullable: false },
		},
		manyToOne: {
			team: { entity: 'Team', nullable: false },
		},
	}),
	Profile: defineEntity({
		fields: {
			id: defineIdField(),
		},
	}),
	Team: defineEntity({
		fields: {
			id: defineIdField(),
		},
	}),
} as const;

type UserInput = InputType<typeof entityDefinitions, typeof entityDefinitions.User>;

describe('Dummy backend: save validation', () => {
	const runQuery = vi.fn(async (query: string) => {
		if (query.startsWith('select')) {
			return { rows: [ { id: 1, name: 'Alice', profile_id: 2, team_id: 3 } ] };
		}
		if (query.startsWith('insert')) {
			return { rows: [ { id: 1, name: 'Alice', profile_id: 2, team_id: 3 } ] };
		}
		if (query.startsWith('update')) {
			return { rows: [ { id: 1, name: 'Alice', profile_id: 2, team_id: 3 } ] };
		}
		throw new Error(`Unexpected query: ${query}`);
	});
	const db = new Farstorm({ type: 'dummy', runQuery }, entityDefinitions);

	async function expectSaveError(input: unknown, code: string) {
		await expect(db.inTransaction(({ saveOne }) => saveOne('User', input as UserInput))).rejects.toThrowError(new RegExp(code));
	}

	it('rejects a missing required field', async () => {
		await expectSaveError({ profile: { id: '2' }, team: { id: '3' } }, 'ORM-1301');
	});

	it('rejects null for a required owned one-to-one relation', async () => {
		await expectSaveError({ name: 'Alice', profile: null, team: { id: '3' } }, 'ORM-1302');
	});

	it('rejects an owned one-to-one relation without an ID', async () => {
		await expectSaveError({ name: 'Alice', profile: {}, team: { id: '3' } }, 'ORM-1303');
	});

	it('rejects null for a required many-to-one relation', async () => {
		await expectSaveError({ name: 'Alice', profile: { id: '2' }, team: null }, 'ORM-1304');
	});

	it('rejects a many-to-one relation without an ID', async () => {
		await expectSaveError({ name: 'Alice', profile: { id: '2' }, team: {} }, 'ORM-1305');
	});

	it('rejects a null entity when saveOne has nothing to save', async () => {
		await expect(db.inTransaction(({ saveOne }) => saveOne('User', null as never))).rejects.toThrowError(/ORM-1300/);
	});

	it('does not resolve unchanged relation getters when it saves a fetched entity', async () => {
		runQuery.mockClear();

		await db.inTransaction(async ({ findOne, saveOne }) => {
			const user = await findOne('User', '1');
			const savedUser = await saveOne('User', user);

			expect(savedUser.id).toBe('1');
			expect(savedUser.name).toBe('Alice');
		});

		expect(runQuery).toHaveBeenCalledTimes(2);
		expect(runQuery.mock.calls[1]?.[0]).toMatch(/^update "user"/);
	});

	it('ignores unknown properties when it inserts an entity', async () => {
		runQuery.mockClear();

		await db.inTransaction(({ saveOne }) => saveOne('User', {
			name: 'Alice',
			profile: { id: '2' },
			team: { id: '3' },
			unexpected: 'do not write this',
		} as UserInput));

		expect(runQuery).toHaveBeenCalledTimes(1);
		expect(runQuery.mock.calls[0]?.[0]).not.toContain('unexpected');
		expect(runQuery.mock.calls[0]?.[1]).not.toContain('do not write this');
	});

	it('ignores unknown properties when it updates an entity', async () => {
		runQuery.mockClear();

		await db.inTransaction(({ saveOne }) => saveOne('User', {
			id: '1',
			name: 'Alice',
			profile: { id: '2' },
			team: { id: '3' },
			unexpected: 'do not write this',
		} as UserInput));

		expect(runQuery).toHaveBeenCalledTimes(1);
		expect(runQuery.mock.calls[0]?.[0]).not.toContain('unexpected');
		expect(runQuery.mock.calls[0]?.[0]).not.toContain('do not write this');
	});
});
