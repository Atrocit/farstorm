import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { Farstorm, InputType, OutputType, defineEntity, defineField, defineIdField, defineReadonlyField } from '../../src/main.js';

const entityDefinitions = {
	Person: defineEntity({
		fields: {
			id: defineIdField(),
			name: defineField('string', false),
			nameLength: defineReadonlyField('number', false),
			optionalScore: defineReadonlyField('number', true),
		},
	}),
	ReadModel: defineEntity({
		fields: {
			id: defineIdField(),
			computedValue: defineReadonlyField('string', false),
		},
	}),
} as const;

type PersonInput = InputType<typeof entityDefinitions, typeof entityDefinitions.Person>;
type PersonOutput = OutputType<typeof entityDefinitions, typeof entityDefinitions.Person>;

describe('Dummy backend: read-only fields', () => {
	it('includes read-only fields in output types but not input types', () => {
		expectTypeOf<PersonInput>().not.toHaveProperty('nameLength');
		expectTypeOf<PersonOutput>().toHaveProperty('nameLength').toEqualTypeOf<number>();
		expectTypeOf<PersonInput>().not.toHaveProperty('optionalScore');
		expectTypeOf<PersonOutput>().toHaveProperty('optionalScore').toEqualTypeOf<number | null>();
	});

	it('does not insert or update a read-only field', async () => {
		const runQuery = vi.fn(async (query: string) => {
			if (query.startsWith('insert')) return { rows: [ { id: 1, name: 'Alice', name_length: 5 } ] };
			if (query.startsWith('update')) return { rows: [ { id: 1, name: 'Alice Smith', name_length: 11 } ] };
			throw new Error(`Unexpected query: ${query}`);
		});
		const db = new Farstorm({ type: 'dummy', runQuery }, entityDefinitions);

		await db.inTransaction(async ({ saveOne }) => {
			const person = await saveOne('Person', { name: 'Alice', nameLength: 999 } as PersonInput);
			person.name = 'Alice Smith';
			person.nameLength = 999;
			const savedPerson = await saveOne('Person', person);

			expect(savedPerson.nameLength).toBe(11);
		});

		expect(runQuery).toHaveBeenCalledTimes(2);
		expect(runQuery.mock.calls[0]?.[0]).not.toContain('name_length');
		expect(runQuery.mock.calls[0]?.[1]).not.toContain(999);
		expect(runQuery.mock.calls[1]?.[0]).not.toContain('name_length');
		expect(runQuery.mock.calls[1]?.[0]).not.toContain('999');
	});

	it('does not insert read-only fields in a batch', async () => {
		const runQuery = vi.fn(async (query: string) => {
			if (query.startsWith('insert')) return { rows: [
				{ id: 1, name: 'Alice', name_length: 5 },
				{ id: 2, name: 'Bob', name_length: 3 },
			] };
			throw new Error(`Unexpected query: ${query}`);
		});
		const db = new Farstorm({ type: 'dummy', runQuery }, entityDefinitions);

		const result = await db.inTransaction(({ saveMany }) => saveMany('Person', [
			{ name: 'Alice', nameLength: 999 } as PersonInput,
			{ name: 'Bob', nameLength: 999 } as PersonInput,
		]));

		expect(result.map(person => person.nameLength)).toEqual([ 5, 3 ]);
		expect(runQuery).toHaveBeenCalledOnce();
		expect(runQuery.mock.calls[0]?.[0]).not.toContain('name_length');
		expect(runQuery.mock.calls[0]?.[1]).not.toContain(999);
	});

	it('fetches the current row when an update has no writable fields', async () => {
		const runQuery = vi.fn(async (query: string) => {
			if (query.startsWith('select')) return { rows: [ { id: 1, computed_value: 'current' } ] };
			throw new Error(`Unexpected query: ${query}`);
		});
		const db = new Farstorm({ type: 'dummy', runQuery }, entityDefinitions);

		const result = await db.inTransaction(({ saveOne }) => saveOne('ReadModel', { id: '1' }));

		expect(result.computedValue).toBe('current');
		expect(runQuery).toHaveBeenCalledOnce();
		expect(runQuery.mock.calls[0]?.[0]).toBe('select * from "read_model" where "id" = any($1)');
		expect(runQuery.mock.calls[0]?.[1]).toEqual([ [ 1 ] ]);
	});
});
