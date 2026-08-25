import { describe, expect, it } from 'vitest';
import { defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity.js';
import { checkEntityDefinitions } from '../../src/entities/entityDefinitionsChecks.js';

describe('Entity definition checks', () => {
	it('rejects a name used by both a field and a relation', () => {
		const entityDefinitions = {
			TodoItem: defineEntity({
				fields: {
					id: defineIdField(),
					author: defineField('string', false),
				},
				manyToOne: {
					author: { entity: 'User', nullable: false },
				},
			}),
			User: defineEntity({
				fields: {
					id: defineIdField(),
				},
			}),
		};

		expect(() => checkEntityDefinitions(entityDefinitions)).toThrowError(/ORM-1400/);
	});
});
