import { QueryStatsQuery } from '../main.js';

type SchemaValidationErrorContext = {
	entity?: string,
	relation?: string,
	field?: string,
	table?: string,
	column?: string
};

const ormSvCodeMap = {
	// Generic errors
	'ORM-SV-3000': {
		message: 'Table missing',
		explanation: 'An entity was defined, but has no corresponding table in the database schema. Resolve by creating the table.',
	},
	'ORM-SV-3001': {
		message: 'Column missing for field',
		explanation: 'A field was defined, but has no corresponding column in the database schema. Resolve by creating the column.',
	},
	'ORM-SV-3002': {
		message: 'Column is marked as non-nullable, but is nullable for input in the entity definitions',
		explanation: 'A field was defined as nullable for input, but the column in the database schema is non-nullable. This may cause crashes at runtime when trying to insert a null value. Resolve by making the column nullable, or marking the field as non-nullable in the entity definitions.',
	},
	'ORM-SV-3003': {
		message: 'Column is marked as nullable, but is non-nullable for output in the entity definitions',
		explanation: 'A field was defined as non-nullable for output, but the column in the database schema is nullable. This may cause crashes at runtime when trying to select a value which may return null unexpectedly. Resolve by making the column non-nullable, or marking the field as nullable in the entity definitions.',
	},

	// One-to-one owned relations
	'ORM-SV-3100': {
		message: 'Column missing for one-to-one relation (owning side)',
		explanation: 'A one-to-one relation was defined, but has no corresponding column on the owning side in the database schema. Was the column perhaps defined on the wrong table? Resolve by creating the column in the correct table.',
	},
	'ORM-SV-3101': {
		message: 'Column for one-to-one is not nullable, but relation can be null',
		explanation: 'A one-to-one relation was defined as nullable, but the column in the database schema is not nullable. This may cause crashes at runtime when trying to insert a null value. Resolve by making the column nullable, or marking the relation as non-nullable in the entity definitions.',
	},
	'ORM-SV-3102': {
		message: 'Column type for one-to-one relation (owned side) must be bigint',
		explanation: 'The column type for a one-to-one relation (owned side) must be defined as a bigint. Resolve by changing the column type to bigint.',
	},

	// One-to-one inverse relations
	'ORM-SV-3110': {
		message: 'Column missing for one-to-one relation (inverse side)',
		explanation: 'A one-to-one relation was defined, but has no corresponding column on the inverse side in the database schema. Was the column perhaps defined on the wrong table? Resolve by creating the column in the correct table.',
	},
	// ORM-SV-3111 nullability check like 3101 does not make sense, since the entire row may not exist. Non-nullability is pretty much not enforceable in an inverse case
	'ORM-SV-3112': {
		message: 'Column type for one-to-one relation (inverse side) must be bigint',
		explanation: 'The column type for a one-to-one relation (inverse side) must be defined as a bigint. Resolve by changing the column type to bigint.',
	},
	'ORM-SV-3113': {
		message: 'Missing index on one-to-one (inverse side)',
		explanation: 'A one-to-one inverse relation was defined, but there is no index on the column. This may cause performance issues when querying the relation. While there are definitely cases in which indexes provide no benefit, you should consider adding an index.',
	},

	// Many-to-one relations
	'ORM-SV-3120': {
		message: 'Column missing for many-to-one relation',
		explanation: 'A many-to-one relation was defined, but has no corresponding column in the database schema on the many side.',
	},
	'ORM-SV-3121': {
		message: 'Column for many-to-one is not nullable, but relation can be null',
		explanation: 'A many-to-one relation was defined as nullable, but the column in the database schema is not nullable. This may cause crashes at runtime when trying to insert a null value. Resolve by making the column nullable, or marking the relation as non-nullable in the entity definitions.',
	},
	'ORM-SV-3122': {
		message: 'Column type for many-to-one relation must be bigint',
		explanation: 'The column type for a many-to-one relation must be defined as a bigint. Resolve by changing the column type to bigint.',
	},

	// One-to-many relations
	'ORM-SV-3130': {
		message: 'Column missing for one-to-many relation',
		explanation: 'A one-to-many relation was defined, but has no corresponding column in the database schema on the many side.',
	},
	'ORM-SV-3132': {
		message: 'Column type for one-to-many relation must be bigint',
		explanation: 'The column type for a one-to-many relation must be defined as a bigint. Resolve by changing the column type to bigint.',
	},
	'ORM-SV-3133': {
		message: 'Missing index on one-to-many',
		explanation: 'A one-to-many relation was defined, but there is no index on the column. This may cause performance issues when querying the relation. While there are definitely cases in which indexes provide no benefit, you should consider adding an index.',
	},
};

type OrmSvCode = keyof typeof ormSvCodeMap;

function messageFromCodeAndContext(code: OrmSvCode, context: SchemaValidationErrorContext) {
	let output = `[${code}]: ${ormSvCodeMap[code].message}`;
	if (context.entity) {
		output += ` on entity '${context.entity}'`;
	}
	if (context.entity && context.relation) {
		output += ` for relation '${context.entity}'.'${context.relation}'`;
	}
	if (context.entity && context.field) {
		output += ` on field '${context.entity}'.'${context.field}'`;
	}

	if (context.table && context.column) {
		output += ` on column '${context.table}'.'${context.column}'`;
	} else if (context.table) {
		output += ` on table '${context.table}'`;
	}
	return output;
}

export class SchemaValidationError extends Error {

	code: OrmSvCode;
	explanation: string;
	queries?: QueryStatsQuery[];

	constructor(code: OrmSvCode, context: SchemaValidationErrorContext, queries?: QueryStatsQuery[]) {
		super(messageFromCodeAndContext(code, context));
		this.code = code;
		this.explanation = ormSvCodeMap[code].explanation;
		this.queries = queries;
	}

}
