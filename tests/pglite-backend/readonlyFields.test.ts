import { describe, expect, it } from 'vitest';
import { Farstorm, defineEntity, defineField, defineIdField, defineReadonlyField, sql } from '../../src/main.js';

const entityDefinitions = {
	Person: defineEntity({
		fields: {
			id: defineIdField(),
			name: defineField('string', false),
			nameLength: defineReadonlyField('number', true),
		},
	}),
} as const;

describe('PGLite: read-only fields', () => {
	it('reads generated values without writing them', async () => {
		const db = new Farstorm({ type: 'pglite' }, entityDefinitions);
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
});
