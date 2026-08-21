import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineEntity, defineField, defineIdField, Farstorm, sql } from '../../src/main.js';

const JsonRecordSpec = defineEntity({
	fields: {
		id: defineIdField(),
		value: defineField('Json', true),
	},
} as const);

const entityDefinitions = {
	'JsonRecord': JsonRecordSpec,
} as const;

const date = new Date('2026-08-21T12:34:56.789Z');

const jsonValues: { name: string, value: any, expected: any }[] = [
	{ name: 'an object', value: { name: 'Farstorm', stable: true, version: 1 }, expected: { name: 'Farstorm', stable: true, version: 1 } },
	{ name: 'an empty object', value: {}, expected: {} },
	{ name: 'a nested object', value: { nested: { items: [ 1, 'two', false, null ] } }, expected: { nested: { items: [ 1, 'two', false, null ] } } },
	{ name: 'a string', value: 'Farstorm', expected: 'Farstorm' },
	{ name: 'a string that needs SQL escaping', value: `quotes: ' " \\ and unicode: ⚡`, expected: `quotes: ' " \\ and unicode: ⚡` },
	{ name: 'true', value: true, expected: true },
	{ name: 'false', value: false, expected: false },
	{ name: 'a number', value: -123.456, expected: -123.456 },
	{ name: 'zero', value: 0, expected: 0 },
	{ name: 'an array', value: [ 1, 'two', false, null, { nested: true } ], expected: [ 1, 'two', false, null, { nested: true } ] },
	{ name: 'an empty array', value: [], expected: [] },
	{ name: 'null', value: null, expected: null },
	{ name: 'undefined', value: undefined, expected: null },
	{ name: 'an object with an undefined property', value: { present: true, omitted: undefined }, expected: { present: true } },
	{ name: 'an array with an undefined item', value: [ 1, undefined, 3 ], expected: [ 1, null, 3 ] },
	{ name: 'NaN', value: Number.NaN, expected: null },
	{ name: 'positive infinity', value: Number.POSITIVE_INFINITY, expected: null },
	{ name: 'a Date', value: date, expected: date.toISOString() },
];

describe('Postgres: Json fields', () => {
	let db: Farstorm<typeof entityDefinitions>;

	beforeAll(async () => {
		db = new Farstorm({
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
			await nativeQuery(sql`drop table if exists "json_record" cascade;`);
			await nativeQuery(sql`
				create table "json_record" (
					id bigserial primary key,
					value jsonb
				);
			`);
		});
	});

	afterAll(async () => {
		await db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`drop table if exists "json_record" cascade;`);
		});
	});

	it.each(jsonValues)('inserts $name', async ({ value, expected }) => {
		await db.inTransaction(async ({ findOne, saveOne }) => {
			const saved = await saveOne('JsonRecord', { value });
			const fetched = await findOne('JsonRecord', saved.id);

			expect(fetched.value).toEqual(expected);
		});
	});

	it.each(jsonValues)('updates a field to $name', async ({ value, expected }) => {
		await db.inTransaction(async ({ findOne, saveOne }) => {
			const saved = await saveOne('JsonRecord', { value: { initial: true } });
			saved.value = value;
			await saveOne('JsonRecord', saved);

			const fetched = await findOne('JsonRecord', saved.id);
			expect(fetched.value).toEqual(expected);
		});
	});

	it('rejects a BigInt value', async () => {
		await expect(db.inTransaction(async ({ saveOne }) => {
			await saveOne('JsonRecord', { value: 1n });
		})).rejects.toThrow(TypeError);
	});

	it('rejects a circular object', async () => {
		const circular: Record<string, any> = {};
		circular['self'] = circular;

		await expect(db.inTransaction(async ({ saveOne }) => {
			await saveOne('JsonRecord', { value: circular });
		})).rejects.toThrow(TypeError);
	});
});
