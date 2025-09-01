import { sql, SqlStatement } from './helpers/sql.js';
import { SchemaValidationError } from './errors/SchemaValidationError.js';
import { camelCaseToSnakeCase, suffixId } from './util/strings.js';
import { SchemaValidationResult } from './main.js';
import { BaseEntity } from './entities/BaseEntity.js';

/**
 * Running this function will check the entity definitions against the database schema
 * and provide a report to the caller to see if the schema matches expectations
 * Whenever the valid flag is true, the application is safe to boot up
 * @returns A SchemaValidationResult object
 */
export async function validateSchema(entityDefinitions: Record<string, BaseEntity>, nativeQuery: (sqlStatement: SqlStatement) => Promise<any[]>, schema?: string): Promise<SchemaValidationResult> {
	// Fetch the schema from the database
	// TODO: see if we should move the schema discovery step into the driver instead?
	// TODO: add validation on whether foreign keys are defined on all relations
	const columns = await nativeQuery(sql`select * from information_schema.columns where table_schema not ilike 'pg_%' and table_schema <> 'information_schema' and (${schema}::varchar is null or table_schema = ${schema});`);
	const tables: Record<string, Record<string, any>> = {};
	for (const column of columns) {
		tables[column.table_name] = tables[column.table_name] ?? {};
		tables[column.table_name][column.column_name] = column;
	}
	const indexes = await nativeQuery(sql`select * from pg_indexes idx where schemaname not ilike 'pg_%' and schemaname <> 'information_schema' and (${schema}::varchar is null or schemaname = ${schema});`);

	// Prep output arrays
	const errors: SchemaValidationError[] = [];
	const warnings: SchemaValidationError[] = [];

	// Check entity definitions against the tables
	for (const entityName of Object.keys(entityDefinitions)) {
		const entityDefinition = entityDefinitions[entityName];
		const tableName = camelCaseToSnakeCase(entityName);
		const table = tables[tableName];

		// Table existence check. Technically this does check if at least one column exists for the table, but that's fine for now
		if (table == null) {
			errors.push(new SchemaValidationError('ORM-SV-3000', { entity: entityName, table: tableName }));
			continue;
		}

		// Basic field existence check
		for (const fieldName of Object.keys(entityDefinition.fields)) {
			const fieldDefinition = entityDefinition.fields[fieldName];
			const columnName = camelCaseToSnakeCase(fieldName);
			if (table[columnName] == null) {
				errors.push(new SchemaValidationError('ORM-SV-3001', { entity: entityName, field: fieldName, table: tableName, column: columnName }));
				continue;
			}
			if (columnName != 'id') {
				if (table[columnName]['is_nullable'] == 'NO' && fieldDefinition.nullableOnInput && table[columnName]['column_default'] == null) {
					errors.push(new SchemaValidationError('ORM-SV-3002', { entity: entityName, field: fieldName, table: tableName, column: columnName }));
				}
				if (table[columnName]['is_nullable'] == 'YES' && !fieldDefinition.nullableOnOutput) {
					errors.push(new SchemaValidationError('ORM-SV-3003', { entity: entityName, field: fieldName, table: tableName, column: columnName }));
				}
			}
		}

		// One-to-one owned relations
		for (const fieldName of Object.keys(entityDefinition.oneToOneOwned)) {
			const fieldDefinition = entityDefinition.oneToOneOwned[fieldName];
			const columnName = suffixId(camelCaseToSnakeCase(fieldName));
			if (table[columnName] == null) {
				errors.push(new SchemaValidationError('ORM-SV-3100', { entity: entityName, field: fieldName, table: tableName, column: columnName }));
				continue;
			}
			if (table[columnName]['is_nullable'] == 'NO' && fieldDefinition.nullable) {
				errors.push(new SchemaValidationError('ORM-SV-3101', { entity: entityName, field: fieldName, table: tableName, column: columnName }));
			}
			if (table[columnName]['udt_name'] != 'int8') {
				errors.push(new SchemaValidationError('ORM-SV-3102', { entity: entityName, field: fieldName, table: tableName, column: columnName }));
			}
		}

		// One-to-one inverse relations
		for (const fieldName of Object.keys(entityDefinition.oneToOneInverse)) {
			const targetEntityName = entityDefinition.oneToOneInverse[fieldName].entity;
			const targetTable = camelCaseToSnakeCase(targetEntityName);
			const targetField = entityDefinition.oneToOneInverse[fieldName].inverse;
			const fieldDefinition = entityDefinitions[targetEntityName].oneToOneOwned[targetField];
			const columnName = suffixId(camelCaseToSnakeCase(targetField));
			if (tables[targetTable][columnName] == null) {
				errors.push(new SchemaValidationError('ORM-SV-3110', { entity: entityName, field: fieldName, table: targetTable, column: columnName }));
				continue;
			}
			if (tables[targetTable][columnName]['udt_name'] != 'int8') {
				errors.push(new SchemaValidationError('ORM-SV-3112', { entity: entityName, field: fieldName, table: targetTable, column: columnName }));
			}

			// Index check
			const hasIndex = indexes.some(idx => idx.tablename == targetTable && idx.indexdef.split('USING')[1].includes('(' + columnName + ')'));
			if (!hasIndex) {
				warnings.push(new SchemaValidationError('ORM-SV-3113', { entity: entityName, field: fieldName, table: targetTable, column: columnName }));
			}
		}

		// Many-to-one relations
		for (const fieldName of Object.keys(entityDefinition.manyToOne)) {
			const fieldDefinition = entityDefinition.manyToOne[fieldName];
			const columnName = suffixId(camelCaseToSnakeCase(fieldName));
			if (table[columnName] == null) {
				errors.push(new SchemaValidationError('ORM-SV-3120', { entity: entityName, field: fieldName, table: tableName, column: columnName }));
				continue;
			}
			if (table[columnName]['is_nullable'] == 'NO' && fieldDefinition.nullable) {
				errors.push(new SchemaValidationError('ORM-SV-3121', { entity: entityName, field: fieldName, table: tableName, column: columnName }));
			}
			if (table[columnName]['udt_name'] != 'int8') {
				errors.push(new SchemaValidationError('ORM-SV-3102', { entity: entityName, field: fieldName, table: tableName, column: columnName }));
			}
		}

		// One-to-many relations
		for (const fieldName of Object.keys(entityDefinition.oneToMany)) {
			const targetEntityName = entityDefinition.oneToMany[fieldName].entity;
			const targetTable = camelCaseToSnakeCase(targetEntityName);
			const targetField = entityDefinition.oneToMany[fieldName].inverse;
			const fieldDefinition = entityDefinitions[targetEntityName].manyToOne[targetField];
			const columnName = suffixId(camelCaseToSnakeCase(targetField));
			if (tables[targetTable][columnName] == null) {
				errors.push(new SchemaValidationError('ORM-SV-3130', { entity: entityName, field: fieldName, table: targetTable, column: columnName }));
				continue;
			}
			if (tables[targetTable][columnName]['udt_name'] != 'int8') {
				errors.push(new SchemaValidationError('ORM-SV-3132', { entity: entityName, field: fieldName, table: targetTable, column: columnName }));
			}

			// Index check
			const hasIndex = indexes.some(idx => idx.tablename == targetTable && idx.indexdef.split('USING')[1].includes('(' + columnName + ')'));
			if (!hasIndex) {
				warnings.push(new SchemaValidationError('ORM-SV-3133', { entity: entityName, field: fieldName, table: targetTable, column: columnName }));
			}
		}
	}

	if (errors.length == 0) {
		return { valid: true, warnings };
	}
	return { valid: false, errors, warnings };
}
