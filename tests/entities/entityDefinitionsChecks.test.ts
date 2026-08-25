import { describe, expect, it } from 'vitest';
import { BaseEntity, defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity.js';
import { checkEntityDefinitions } from '../../src/entities/entityDefinitionsChecks.js';

describe('Entity definition checks', () => {
	const entityWithId = () => defineEntity({
		fields: {
			id: defineIdField(),
		},
	});

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

	it.each([
		[ 'owned one-to-one', { oneToOneOwned: { missing: { entity: 'Missing', nullable: false } } } ],
		[ 'inverse one-to-one', { oneToOneInverse: { missing: { entity: 'Missing', inverse: 'owner', nullable: false } } } ],
		[ 'many-to-one', { manyToOne: { missing: { entity: 'Missing', nullable: false } } } ],
		[ 'one-to-many', { oneToMany: { missing: { entity: 'Missing', inverse: 'owner' } } } ],
	])('rejects a %s relation to an unknown entity', (_description, relations) => {
		const source = defineEntity({
			fields: {
				id: defineIdField(),
			},
			...relations,
		} as Parameters<typeof defineEntity>[0]);

		expect(() => checkEntityDefinitions({ Source: source })).toThrowError(/ORM-1401/);
	});

	it('rejects a one-to-many relation without its inverse many-to-one relation', () => {
		const entityDefinitions = {
			Parent: defineEntity({
				fields: { id: defineIdField() },
				oneToMany: {
					children: { entity: 'Child', inverse: 'parent' },
				},
			}),
			Child: entityWithId(),
		};

		expect(() => checkEntityDefinitions(entityDefinitions)).toThrowError(/ORM-1402/);
	});

	it('rejects an inverse one-to-one relation without its owned relation', () => {
		const entityDefinitions = {
			Profile: defineEntity({
				fields: { id: defineIdField() },
				oneToOneInverse: {
					user: { entity: 'User', inverse: 'profile', nullable: false },
				},
			}),
			User: entityWithId(),
		};

		expect(() => checkEntityDefinitions(entityDefinitions)).toThrowError(/ORM-1403/);
	});

	it.each([
		[ 'nullable on one-to-many', 'ORM-1410', {
			Parent: defineEntity({
				fields: { id: defineIdField() },
				oneToMany: {
					children: { entity: 'Child', inverse: 'parent', nullable: true },
				},
			} as unknown as Parameters<typeof defineEntity>[0]),
			Child: defineEntity({
				fields: { id: defineIdField() },
				manyToOne: { parent: { entity: 'Parent', nullable: false } },
			}),
		} ],
		[ 'inverse on owned one-to-one', 'ORM-1411', {
			User: defineEntity({
				fields: { id: defineIdField() },
				oneToOneOwned: {
					profile: { entity: 'Profile', nullable: false, inverse: 'user' },
				},
			} as unknown as Parameters<typeof defineEntity>[0]),
			Profile: entityWithId(),
		} ],
		[ 'inverse on many-to-one', 'ORM-1412', {
			Child: defineEntity({
				fields: { id: defineIdField() },
				manyToOne: {
					parent: { entity: 'Parent', nullable: false, inverse: 'children' },
				},
			} as unknown as Parameters<typeof defineEntity>[0]),
			Parent: entityWithId(),
		} ],
	] satisfies [string, string, Record<string, BaseEntity>][])('rejects %s', (_description, code, entityDefinitions) => {
		expect(() => checkEntityDefinitions(entityDefinitions)).toThrowError(new RegExp(code));
	});
});
