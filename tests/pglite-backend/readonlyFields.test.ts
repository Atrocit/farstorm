import { describe, expect, it } from 'vitest';
import { Farstorm, defineEntity, defineField, defineIdField, defineReadonlyField, sql } from '../../src/main.js';

const personEntityDefinitions = {
	Person: defineEntity({
		fields: {
			id: defineIdField(),
			name: defineField('string', false),
			nameLength: defineReadonlyField('number', true),
		},
	}),
} as const;

const readModelEntityDefinitions = {
	ReadModel: defineEntity({
		fields: {
			id: defineIdField(),
			computedValue: defineReadonlyField('string', false),
		},
	}),
} as const;

describe('PGLite: read-only fields', () => {
	it('reads generated values without writing them', async () => {
		const db = new Farstorm({ type: 'pglite' }, personEntityDefinitions);
		await db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`
				create table "person" (
					id bigserial primary key,
					name character varying not null,
					name_length integer generated always as (char_length(name)) stored
				);
			`);
		});

		await db.inTransaction(async ({ saveOne, validateSchema }) => {
			const validation = await validateSchema();
			expect(validation.valid ? [] : validation.errors.map(error => error.code)).toEqual([]);

			const person = await saveOne('Person', { name: 'Alice' });
			expect(person.nameLength).toBe(5);

			person.name = 'Alice Smith';
			person.nameLength = 999;
			const savedPerson = await saveOne('Person', person);
			expect(savedPerson.nameLength).toBe(11);
		});
	});

	it('inserts every entity in a read-only-only batch', async () => {
		const db = new Farstorm({ type: 'pglite' }, readModelEntityDefinitions);
		await db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`
				create table "read_model" (
					id bigserial primary key,
					computed_value character varying not null default 'current'
				);
			`);
		});

		const actual = await db.inTransaction(async ({ nativeQuery, saveMany }) => {
			const results = await saveMany('ReadModel', [ {}, {} ]);
			const countRows = await nativeQuery(sql`select count(*) as count from "read_model";`);
			return { returned: results.length, stored: Number(countRows[0].count) };
		});

		expect(actual).toEqual({ returned: 2, stored: 2 });
	});
});
