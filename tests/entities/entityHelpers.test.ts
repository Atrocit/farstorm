import { describe, expect, it } from 'vitest';
import { defineEntity, defineIdField } from '../../src/entities/BaseEntity.js';
import { isNullable } from '../../src/entities/Nullable.js';

describe('Entity helpers', () => {
	it('supports the named nullable modes', () => {
		expect(isNullable('NULLABLE')).toBe(true);
		expect(isNullable('NOT NULL')).toBe(false);
	});

	it('allows an undefined legacy relations property', () => {
		const entity = defineEntity({
			fields: { id: defineIdField() },
			relations: undefined,
		});

		expect(entity.fields.id).toBeDefined();
	});

	it('rejects a defined legacy relations property', () => {
		expect(() => defineEntity({
			fields: { id: defineIdField() },
			relations: {},
		} as unknown as Parameters<typeof defineEntity>[0])).toThrowError(/use the appropriate relation type keys/);
	});
});
