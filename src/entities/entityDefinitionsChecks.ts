import { BaseEntity } from './BaseEntity';
import { OrmError } from '../errors/OrmError';

export function checkEntityDefinitions(entityDefinitions: Record<string, BaseEntity>) {
	// Find conflicting fields and relations
	for (const entityName in entityDefinitions) {
		const entity = entityDefinitions[entityName];
		const fieldNames = new Set(Object.keys(entity.fields));
		const oneToOneOwnedRelationNames = new Set(Object.keys(entity.oneToOneOwned));
		const oneToOneInverseRelationName = new Set(Object.keys(entity.oneToOneInverse));
		const manyToOneRelationNames = new Set(Object.keys(entity.manyToOne));
		const oneToManyRelationNames = new Set(Object.keys(entity.oneToMany));

		const allNames = new Set([
			...fieldNames,
			...oneToOneOwnedRelationNames,
			...oneToOneInverseRelationName,
			...manyToOneRelationNames,
			...oneToManyRelationNames,
		]);

		for (const name in allNames) {
			const inField = fieldNames.has(name);
			const inOneToOneOwned = oneToOneOwnedRelationNames.has(name);
			const inOneToOneInverse = oneToOneInverseRelationName.has(name);
			const inManyToOne = manyToOneRelationNames.has(name);
			const inOneToMany = oneToManyRelationNames.has(name);

			const count = [ inField, inOneToOneOwned, inOneToOneInverse, inManyToOne, inOneToMany ].reduce((acc, val) => acc + (val ? 1 : 0), 0);
			if (count > 1) {
				throw new OrmError('ORM-1400', {
					entity: entityName,
					field: name,
					operation: 'entityDefinitionValidation',
				});
			}
		}
	}

	// Relations point to entities that actually exist
	for (const entityName in entityDefinitions) {
		const entity = entityDefinitions[entityName];

		for (const relationName in entity.oneToOneOwned) {
			if (entityDefinitions[entity.oneToOneOwned[relationName].entity] == null) {
				throw new OrmError('ORM-1401', { entity: entityName, relation: relationName, operation: 'entityDefinitionValidation' });
			}
		}
		for (const relationName in entity.oneToOneInverse) {
			if (entityDefinitions[entity.oneToOneInverse[relationName].entity] == null) {
				throw new OrmError('ORM-1401', { entity: entityName, relation: relationName, operation: 'entityDefinitionValidation' });
			}
		}
		for (const relationName in entity.manyToOne) {
			if (entityDefinitions[entity.manyToOne[relationName].entity] == null) {
				throw new OrmError('ORM-1401', { entity: entityName, relation: relationName, operation: 'entityDefinitionValidation' });
			}
		}
		for (const relationName in entity.oneToMany) {
			if (entityDefinitions[entity.oneToMany[relationName].entity] == null) {
				throw new OrmError('ORM-1401', { entity: entityName, relation: relationName, operation: 'entityDefinitionValidation' });
			}
		}
	}

	// Check if there is a corresponding many-to-one for any one-to-many relation
	for (const entityName in entityDefinitions) {
		const entity = entityDefinitions[entityName];

		for (const relationName in entity.oneToMany) {
			const relation = entity.oneToMany[relationName];
			const targetEntity = entityDefinitions[relation.entity];
			if (targetEntity.manyToOne[relation.inverse] == null) {
				throw new OrmError('ORM-1402', { entity: entityName, relation: relationName, operation: 'entityDefinitionValidation' });
			}
		}
	}

	// Check for any one-to-one-inverse that has a corresponding one-to-one-owned
	for (const entityName in entityDefinitions) {
		const entity = entityDefinitions[entityName];

		for (const relationName in entity.oneToOneInverse) {
			const relation = entity.oneToOneInverse[relationName];
			const targetEntity = entityDefinitions[relation.entity];
			if (targetEntity.oneToOneOwned[relation.inverse] == null) {
				throw new OrmError('ORM-1403', { entity: entityName, relation: relationName, operation: 'entityDefinitionValidation' });
			}
		}
	}

	// Validate certain excess properties do not exist on relations
	// TypeScript should prevent these, or at least force them to undefined, but it's an easy extra check to add
	for (const entityName in entityDefinitions) {
		const entity = entityDefinitions[entityName];

		for (const relationName in entity.oneToMany) {
			const relation = entity.oneToMany[relationName];
			if ('nullable' in relation) {
				throw new OrmError('ORM-1410', { entity: entityName, relation: relationName, operation: 'entityDefinitionValidation' });
			}
		}
		for (const relationName in entity.oneToOneOwned) {
			const relation = entity.oneToOneOwned[relationName];
			if ('inverse' in relation) {
				throw new OrmError('ORM-1411', { entity: entityName, relation: relationName, operation: 'entityDefinitionValidation' });
			}
		}
		for (const relationName in entity.manyToOne) {
			const relation = entity.manyToOne[relationName];
			if ('inverse' in relation) {
				throw new OrmError('ORM-1412', { entity: entityName, relation: relationName, operation: 'entityDefinitionValidation' });
			}
		}
	}
}