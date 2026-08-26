import { describe, expect, it } from 'vitest';
import { Farstorm, defineEntity, defineField, defineIdField, defineReadonlyField, sql } from '../../src/main.js';

const entityDefinitions = {
	ComputedCounter: defineEntity({
		fields: {
			id: defineIdField(),
			baseValue: defineField('number', false),
			nextValue: defineReadonlyField('number', false),
		},
	}),
} as const;

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
	}, entityDefinitions);

	await db.inTransaction(async ({ nativeQuery }) => {
		await nativeQuery(sql`drop table if exists "computed_counter" cascade;`);
		await nativeQuery(sql`
			create table "computed_counter" (
				id bigserial primary key,
				base_value bigint not null,
				next_value bigint generated always as (base_value + 1) stored
			);
		`);
	});

	return {
		db,
		cleanup: () => db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`drop table if exists "computed_counter" cascade;`);
		}),
	};
}

describe('Postgres: read-only fields', () => {
	it('returns the recalculated value of a generated column after an update', async () => {
		const { db, cleanup } = await setup();

		try {
			await db.inTransaction(async ({ saveOne }) => {
				const counter = await saveOne('ComputedCounter', { baseValue: 10 });
				expect(counter.nextValue).toBe(11);

				counter.baseValue = 41;
				counter.nextValue = 999;
				const updatedCounter = await saveOne('ComputedCounter', counter);

				expect(updatedCounter.baseValue).toBe(41);
				expect(updatedCounter.nextValue).toBe(42);
			});
		} finally {
			await cleanup();
		}
	});

	it('saves a spread result from findOne', async () => {
		const { db, cleanup } = await setup();

		try {
			await db.inTransaction(async ({ findOne, saveOne }) => {
				const counter = await saveOne('ComputedCounter', { baseValue: 10 });
				const fetchedCounter = await findOne('ComputedCounter', counter.id);
				const updatedCounter = await saveOne('ComputedCounter', {
					...fetchedCounter,
					baseValue: 20,
				});

				expect(updatedCounter.baseValue).toBe(20);
				expect(updatedCounter.nextValue).toBe(21);
			});
		} finally {
			await cleanup();
		}
	});
});
