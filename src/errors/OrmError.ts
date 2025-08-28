import { QueryStatsQuery } from '../main';

type OrmErrorContext = {
	entity?: string,
	relation?: string,
	field?: string,
	operation: string,
};

const ormCodeMap = {
	// Generic
	'ORM-1000': {
		message: 'Inactive transaction',
		explanation: `Functions that interact with the database must be called within a transaction. You might see this error if you pass objects fetched within a transaction to code that executes outside of the transaction, or in another, separate transaction. You might also see this if you forget to add an await within the transaction, the function can then return before you're done with all database operations.`,
	},
	'ORM-1001': {
		message: 'Failed to update cache',
		explanation: `The cache failed to update for an unknown reason, even after explicitly trying to load the relation. This is likely a bug in the cache implementation.`,
	},

	// Cardinality errors
	// One-to-one owned
	'ORM-1100': {
		message: 'Cache found multiple entities for one-to-one relation (owning side)',
		explanation: `When looking entities up in the relation cache, we found multiple entities for a one-to-one relation. This points to a bug in the cache implementation, or to a missing primary key / uniqueness constraint on the ID column of the target table (which is unlikely)`,
	},
	'ORM-1101': {
		message: 'One-to-one relation (owning side) resolved to null in cache, but is marked non-nullable',
		explanation: `The one-to-one relation found in cache was null, but is marked as non-nullable. This either points to a bug in the cache (perhaps cache should've been invalidated), or it means you marked a relation as non-nullable in the entity definition, but the database allows nulls in the column. You should either disallow nulls in the column, marking the relation truly non-nullable, or mark the relation as nullable in the entity definition.`,
	},
	'ORM-1102': {
		message: 'One-to-one relation (owning side) has non-null value in column, but is marked non-nullable',
		explanation: `The one-to-one relation has a NULL value in the database column, but is marked as non-nullable in the entity definition. This is a mismatch between the database and the entity definition. You should either mark the column NOT NULL in the database, or marking the relation as nullable in the entity definitions.`,
	},

	// One-to-one inverse
	'ORM-1110': {
		message: 'Cache found multiple entities for one-to-one relation (inverse)',
		explanation: `When looking entities up in the relation cache, we found multiple entities for a one-to-one relation on the inverse side. This points to a bug in the cache implementation, or to a missing uniqueness constraint on the foreign key column on the owning side, leading to multiple entities pointing to the same entity on the inverse side. Either add a unique constraint on the foreign key column, or mark the relation on this side as a one-to-many, and on the owning side as a many-to-one instead.`,
	},
	'ORM-1111': {
		message: 'One-to-one relation (inverse side) resolved to null in cache, but is marked non-nullable',
		explanation: `The one-to-one relation found in cache was null, but is marked as non-nullable. This either points to a bug in the cache (perhaps cache should've been invalidated), or it means you marked a relation as non-nullable in the entity definition, but the database allows nulls in the column. For one-to-one inverse relations this is essentially unfixable, as you cannot mark the owning side as NOT NULL, since it will make instantiation impossible. However, you should make sure to not fetch the one-to-one inverse side before the other side is properly set, or mark it as nullable in the entity definitions.`,
	},

	// Many-to-one
	'ORM-1120': {
		message: 'Cache found multiple entities for many-to-one relation',
		explanation: `When looking entities up in the relation cache, we found multiple entities for a many-to-one relation. This points to a bug in the cache implementation, or to a missing primary key / uniqueness constraint on the ID column of the target table (which is unlikely)`,
	},
	'ORM-1121': {
		message: 'Many-to-one relation resolved to null in cache, but is marked non-nullable',
		explanation: `The many-to-one relation found in cache was null, but is marked as non-nullable. This either points to a bug in the cache (perhaps cache should've been invalidated), or it means you marked a relation as non-nullable in the entity definition, but the database allows nulls in the column. You should either disallow nulls in the column, marking the relation truly non-nullable, or mark the relation as nullable in the entity definition.`,
	},
	'ORM-1122': {
		message: 'Many-to-one relation has non-null value in column, but is marked non-nullable',
		explanation: `The many-to-one relation has a NULL value in the database column, but is marked as non-nullable in the entity definition. This is a mismatch between the database and the entity definition. You should either mark the column NOT NULL in the database, or marking the relation as nullable in the entity definitions.`,
	},

	// Finding / select errors
	'ORM-1200': {
		message: 'Entity not found',
		explanation: `Cannot find the entity specified by the ID supplied`,
	},
	'ORM-1201': {
		message: 'Query returned multiple rows, but only expected one',
		explanation: `The query to find the entity returned multiple rows, but this operation expected only one. This caused either by a bug in the ORM, or by a missing primary key / uniqueness constraint on the ID column of the table.`,
	},
	'ORM-1202': {
		message: 'Query returned different number of rows than expected based on input',
		explanation: `The query returned a different number of rows than expected based on the input. When fetching multiple items by ID this can either be caused by trying to fetch IDs that do not occur in the database, or by multiple rows having the same IDs.`,
	},

	// Saving / validation errors on write
	'ORM-1300': {
		message: 'Save query failed',
		explanation: 'The save query failed for an unknown reason, the save operation returned fewer rows than expected.',
	},
	'ORM-1301': {
		message: 'Passed null for non-nullable field',
		explanation: `A value of undefined or null was passed for a field that was marked non-nullable in the entity definition. You should either mark the field as nullable in the entity definition, or pass a valid value.`,
	},
	'ORM-1302': {
		message: 'Cannot set non-nullable one-to-one relation (owning side) to null value',
		explanation: `The one-to-one relation was given a value of undefined or null, but is marked as non-nullable in the entity definitions. You should either mark the relation as nullable in the entity definitions, or pass a valid value`,
	},
	'ORM-1303': {
		message: 'Cannot use non-saved entity for one-to-one relation (owning side)',
		explanation: `The one-to-one relation was given an entity that hasn't been saved yet, judging by the undefined/null value found in the ID column. You should save the target entity before saving this one, cascading functionality is not allowed here.`,
	},
	'ORM-1304': {
		message: 'Cannot set non-nullable many-to-one relation to null value',
		explanation: `The many-to-one relation was given a value of undefined or null, but is marked as non-nullable in the entity definitions. You should either mark the relation as nullable in the entity definitions, or pass a valid value`,
	},
	'ORM-1305': {
		message: 'Cannot use non-saved entity for many-to-one relation',
		explanation: `The many-to-one relation was given an entity that hasn't been saved yet, judging by the undefined/null value found in the ID column. You should save the target entity before saving this one, cascading functionality is not allowed here.`,
	},

	// Entity definitions validation errors
	'ORM-1400': {
		message: 'Entity definition has conflicting fields and relations',
		explanation: `The entity definition has a field or relation that is defined multiple times. This is not allowed, as it leads to ambiguity. You should either remove the duplicate definition, or rename one of the conflicting fields or relations.`,
	},
	'ORM-1401': {
		message: 'Relation in entity definition points to non-existing entity',
		explanation: `The relation points to an entity that doesn't exist. This is not allowed. You should either remove the relation, fix the entity name, or add the target entity in the entity definitions.`,
	},
	'ORM-1402': {
		message: 'One-to-many relation in entity definition has no corresponding many-to-one',
		explanation: `The one-to-many relation in the entity definition has no corresponding many-to-one relation in the target entity. This means you cannot update the relation, as the one-to-many side is read-only. You should either add the missing many-to-one relation, or remove the one-to-many relation.`,
	},
	'ORM-1403': {
		message: 'One-to-one-inverse relation in entity definition has no corresponding one-to-one-owned',
		explanation: `The one-to-one-inverse relation in the entity definition has no corresponding one-to-one-owned relation in the target entity. This means you cannot update the relation, as the one-to-one-inverse side is read-only. You should either add the missing one-to-one-owned relation, or remove the one-to-one-inverse relation.`,
	},
	'ORM-1410': {
		message: 'One-to-many should not have nullable property',
		explanation: `Nullable properties in one-to-many relations are not allowed, since the output is always an array. It is not possible to have an array with a null value, the value will just not appear in the array. You should remove the nullable property from the relation.`,
	},
	'ORM-1411': {
		message: 'One-to-one-owned should not have inverse property',
		explanation: `Inverse properties in one-to-one-owned relations are not allowed, since the relation is defined by a field on the entity itself. Inverse properties are for specifying which field populates a relation on the target entity in one-to-one inverse or one-to-many relations. You should remove the inverse property from the relation.`,
	},
	'ORM-1412': {
		message: 'Many-to-one should not have inverse property',
		explanation: `The entity definition has no primary key defined. This is not allowed, as the ORM needs a primary key to identify entities. You should add a primary key to the entity definition.`,
	},
};

type OrmCode = keyof typeof ormCodeMap;

function messageFromCodeAndContext(code: OrmCode, context: OrmErrorContext) {
	let output = `[${code}]: ${ormCodeMap[code].message} - ${context.operation}`;
	if (context.entity) {
		output += ` on entity '${context.entity}'`;
	}
	if (context.entity && context.relation) {
		output += ` for relation '${context.entity}'.'${context.relation}'`;
	}
	if (context.entity && context.field) {
		output += ` on field '${context.entity}'.'${context.field}'`;
	}
	return output;
}

export class OrmError extends Error {

	explanation: string;
	queries?: QueryStatsQuery[];

	constructor(code: OrmCode, context: OrmErrorContext, queries?: QueryStatsQuery[]) {
		super(messageFromCodeAndContext(code, context));
		this.explanation = ormCodeMap[code].explanation;
		this.queries = queries;
	}

}