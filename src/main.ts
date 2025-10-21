import format from 'pg-format';
import { ChangeTracker } from './transaction/ChangeTracker.js';
import { Driver } from './drivers/Driver.js';
import { ConnectionDetails as DummyConnectionDetails, DummyDriver } from './drivers/dummy.js';
import type { ConnectionDetails as PgLiteConnectionDetails } from './drivers/pglite.js';
import { ConnectionDetails as PgConnectionDetails, PostgresqlDriver } from './drivers/postgresql.js';
import { checkEntityDefinitions } from './entities/entityDefinitionsChecks.js';
import { EntityCache } from './transaction/EntityCache.js';
import { OrmError } from './errors/OrmError.js';
import { SchemaValidationError } from './errors/SchemaValidationError.js';
import EventEmitter from './helpers/MyEventEmitter.js';
import { mergeSql, sql, SqlStatement } from './helpers/sql.js';
import { RelationCache } from './transaction/RelationCache.js';
import { BaseEntityDefinitions } from './types/BaseEntityDefinitions.js';
import { EntityByName, EntityDefinition, EntityName } from './types/EntityTypes.js';
import { OutputType } from './types/OutputType.js';
import { camelCaseToSnakeCase, snakeCaseToCamelCase, suffixId } from './util/strings.js';
import { validateSchema as validateSchemaActual } from './tools/validateSchema.js';
import { InputType } from './types/InputType.js';
import { RawSqlType } from './types/RawSqlType.js';
import { isOrmRelationGetter, ormRelationGetter } from './relations/ormRelationGetter.js';

export type QueryStatsQuery = { query: string, params: any[], durationInMs: number };
export type QueryStats = { queries: QueryStatsQuery[] };

// Represents different parts of findMany queries
// We might add specifics here later for specific entities, hence the <E> type param
type WhereClause<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = SqlStatement;
type OrderByClause<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = SqlStatement;
type Offset = number;
type Limit = number;

// Describes the options for the findMany function
// Makes sure that you cannot set an offset/limit without also specifying an orderBy
type FindManyOptions<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = { where?: WhereClause<ED, E>, orderBy?: OrderByClause<ED, E> } | { where?: WhereClause<ED, E>, orderBy: OrderByClause<ED, E>, offset: Offset, limit: Limit };

function whereClauseToSql<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>>(whereClause: WhereClause<ED, E>): SqlStatement {
	return whereClause; // this function will become more complicated later on
}

function orderByToSql<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>>(orderByClause: OrderByClause<ED, E>): SqlStatement {
	return orderByClause; // this function will become more complicated later on
}

type TransactionControls = {
	query: (query: string, params: any[]) => Promise<{ rows: any[] }>,
	commit: () => Promise<void>,
	rollback: () => Promise<void>,
};

type DbFunctions<ED extends BaseEntityDefinitions> = {
	findOne: <N extends EntityName<ED>>(entityName: N, id: string) => Promise<OutputType<ED, EntityByName<ED, N>>>,
	findOneOrNull: <N extends EntityName<ED>>(entityName: N, id: string) => Promise<OutputType<ED, EntityByName<ED, N>> | null>,
	findByIds: <N extends EntityName<ED>>(entityName: N, ids: string[]) => Promise<OutputType<ED, EntityByName<ED, N>>[]>,
	findMany: <N extends EntityName<ED>>(entityName: N, options: FindManyOptions<ED, EntityByName<ED, N>>) => Promise<OutputType<ED, EntityByName<ED, N>>[]>,
	count: <N extends EntityName<ED>>(entityName: N, options?: { where?: WhereClause<ED, EntityByName<ED, N>> }) => Promise<number>,
	findManyAndCount: <N extends EntityName<ED>>(entityName: N, options: FindManyOptions<ED, EntityByName<ED, N>>) => Promise<{ results: OutputType<ED, EntityByName<ED, N>>[], total: number }>,
	nativeQuery: (sqlStatement: SqlStatement) => Promise<any[]>,
	saveOne: <N extends EntityName<ED>>(entityName: N, entity: InputType<ED, EntityByName<ED, N>>) => Promise<OutputType<ED, EntityByName<ED, N>>>,
	saveMany: <N extends EntityName<ED>>(entityName: N, entities: InputType<ED, EntityByName<ED, N>>[]) => Promise<OutputType<ED, EntityByName<ED, N>>[]>,
	deleteByIds: <N extends EntityName<ED>>(entityName: N, ids: string[]) => Promise<void>,
	deleteMany: <N extends EntityName<ED>>(entityName: N, options: { where: WhereClause<ED, EntityByName<ED, N>> }) => Promise<void>,
	validateSchema: (schemaName?: string) => Promise<SchemaValidationResult>,
	readonly transactionStatistics: QueryStats,
};

type TransactionalEventListener<ED extends BaseEntityDefinitions> = (changes: ChangeTracker<EntityName<ED>>, dbFunctions: DbFunctions<ED>) => Promise<void>;
type NonTransactionalEventListener<ED extends BaseEntityDefinitions> = (changes: ChangeTracker<EntityName<ED>>, transactionConfig: TransactionConfig<ED>) => Promise<void>;
type TransactionConfig<ED extends BaseEntityDefinitions> = {
	beforeCommitListeners?: TransactionalEventListener<ED>[],
	afterCommitListeners?: TransactionalEventListener<ED>[], // deprecated, use the non transactional version instead and manually control transaction semantics
	afterCommitListenersNonTransactional?: NonTransactionalEventListener<ED>[],
	auditMetadata?: any,	// will be persisted as metadata along side any audit logs, must be serializable to JSON
};

type ConnectionDetails = PgConnectionDetails | PgLiteConnectionDetails | DummyConnectionDetails;

export type SchemaValidationResult =
	{
		valid: true,
		warnings: SchemaValidationError[],
	} | {
		valid: false,
		errors: SchemaValidationError[],
		warnings: SchemaValidationError[],
	};

export class Farstorm<const ED extends BaseEntityDefinitions> extends EventEmitter {
	private auditLoggingEnabled: boolean = false;
	private entityDefinitions: ED;
	private driver: Driver;

	constructor(connectionDetails: ConnectionDetails, entityDefinitions: ED) {
		super();

		this.entityDefinitions = entityDefinitions;
		if (connectionDetails.type == 'postgresql') {
			this.driver = new PostgresqlDriver(connectionDetails);
		} else if (connectionDetails.type == 'pglite') {
			this.driver = new (class LazyPgLiteDriver extends EventEmitter {
				private real: any | null = null;
				private cd: PgLiteConnectionDetails;
				constructor(cd: PgLiteConnectionDetails) {
					super();
					this.cd = cd;
				}

				private async ensure() {
					if (this.real) return this.real;
					try {
						const mod = await import('./drivers/pglite.js');
						this.real = new mod.PgLiteDriver(this.cd);
						// proxy events
						this.real.on('error', (...args: any[]) => this.emit('error', ...args));
						this.real.on('warning', (...args: any[]) => this.emit('warning', ...args));
						return this.real;
					} catch (e) {
						throw new Error("PgLite driver not available. Install '@electric-sql/pglite' to use the pglite backend.");
					}
				}

				async startTransaction(options?: { readOnly?: boolean }) {
					const d = await this.ensure();
					return d.startTransaction(options);
				}
			})(connectionDetails as PgLiteConnectionDetails);
		} else if (connectionDetails.type == 'dummy') {
			this.driver = new DummyDriver(connectionDetails);
		} else {
			this.driver = null as any;
		}

		// Patch emitted errors/warnings through
		if (this.driver != null) {
			this.driver.on('error', (...args) => this.emit('error', ...args));
			this.driver.on('warning', (...args) => this.emit('warning', ...args));
		}

		// Check the entity definitions
		checkEntityDefinitions(entityDefinitions);
	}

	/**
	 * Enable audit logging from this point onwards
	 * It is important that before this function gets called, the appropriate audit_log table format is created
	 * This is the responsibility of the caller, this function will only validate a valid table exists
	 * If a correct table exists to log the audit events, from here on out the ORM will log all inserts/updates
	 * IMPORTANT: inserts/updates/deletions through native queries will not be tracked by the audit log system
	 */
	async enableAuditLogging() {
		// const tx = await this.driver.startTransaction();

		// try {
		// 	// Run schema validation with a fictive entity to validate the schema is actually what we expect
		// 	const result = await validateSchemaActual({
		// 		AuditLog: defineEntity({
		// 			fields: {
		// 				id: defineIdField(),
		// 				timestamp: defineField('Date', false),
		// 				transactionId: defineField('number', false),
		// 				table: defineField('string', false),
		// 				entityId: defineField('number', false),
		// 				type: defineCustomField(false, x => x as ('INSERT' | 'UPDATE' | 'DELETE'), x => x),
		// 				diff: defineCustomField(false, x => x, x => x),
		// 				metadata: defineCustomField(false, x => x, x => x),
		// 			},
		// 		}),
		// 	}, statement => tx.query(statement.sql, statement.params).then(r => r.rows));
		// 	if (!result.valid) {
		// 		this.auditLoggingEnabled = false;
		// 		throw Error('Cannot enable audit logging due to schema mismatch');
		// 	}
		this.auditLoggingEnabled = true;
		// } finally {
		// 	tx.commit();
		// }
	}

	/**
	 * Disables audit logging
	 */
	async disableAuditLogging() {
		this.auditLoggingEnabled = false;
	}

	/**
	* Starts a new transaction with a number of functions to apply certain operations
	* @param executor The function which gets passed the various operations one can do
	* @param transactionConfig Configuration settings, like before and after commit listeners
	*/
	async inTransaction<P>(executor: (dbFunctions: DbFunctions<ED>) => Promise<P>, transactionConfig?: TransactionConfig<ED>): Promise<P> {
		let transactionControls: TransactionControls | null = null;
		const auditMetadata = transactionConfig?.auditMetadata ?? {};

		// Local entity cache, this is where we store all entities that are fetched during the transaction
		const localCache: EntityCache<EntityName<ED>, RawSqlType<ED, ED[EntityName<ED>]>> = new EntityCache();

		// This variable tracks the number of relations not served from cache (e.g. fetched from db) during the transaction
		// This is useful for debugging and performance optimization. Repeated relation cache busting is problematic and should be solved.
		let relationCacheMisses = 0;

		// This is the relations cache, if a record exists for a specific relation, that means it was fetch before AND is current
		const ownedRelationCache: RelationCache<EntityName<ED>, string, string[]> = new RelationCache();
		const inverseRelationCache: RelationCache<EntityName<ED>, string, { ids: string[], inverseMap: Record<string, { id: string }[]> }> = new RelationCache();

		// Keep track of the stuff we inserted/updated/deleted within this transaction, log number of queries etc.
		const queryStatistics: QueryStats = { queries: [] };
		const changedEntities = new ChangeTracker<EntityName<ED>>();

		/**
		 * This takes the raw SQL result and converts it into a proper OutputType for the entity
		 * This function is responsible for putting in the Promise getters which will actually fetch any relations
		 */
		const createOutputTypeFromRawSqlType = <N extends EntityName<ED>>(entityName: N, result: RawSqlType<ED, EntityByName<ED, N>>): OutputType<ED, EntityByName<ED, N>> => {
			const entityDefinition = this.entityDefinitions[entityName];
			const output: Record<string, any> = {}; // Realistically the type is way stricter, more like Record<FieldNames<EntityByName<N>> | RelationNames<EntityByName<N>>, any>

			// Copy over each field on the entity definition
			for (const field of Object.keys(entityDefinition.fields)) {
				const entityField = entityDefinition.fields[field];
				const value = result[camelCaseToSnakeCase(field)];
				output[field] = value == null ? null : entityField.toType(value);
			}

			// One-to-one owned relations
			for (const relationName of Object.keys(entityDefinition.oneToOneOwned)) {
				const relation = entityDefinition.oneToOneOwned[relationName];

				const relationRawFieldName = suffixId(camelCaseToSnakeCase(relationName as string));
				if (result[relationRawFieldName] == null) {
					if (!relation.nullable) throw new OrmError('ORM-1102', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-one-owned' }, queryStatistics.queries);
					output[relationName] = null;
					continue;
				}

				const getOneToOneRelation = async () => {
					if (!transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-one-owned' });

					if (ownedRelationCache.find(entityName, relationName) == null) {
						ownedRelationCache.overwrite(entityName, relationName, fetchOneToOneOwnedRelation(entityName, relationName));
					}
					const cached = await ownedRelationCache.find(entityName, relationName);
					if (cached == null) throw new OrmError('ORM-1001', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-one-owned' });

					const rawResult = localCache.get(relation.entity, result[relationRawFieldName]);
					if (rawResult == null && !relation.nullable) {
						throw new OrmError('ORM-1121', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-one-owned' }, queryStatistics.queries);
					}
					return rawResult == null ? null : createOutputTypeFromRawSqlType(relation.entity, rawResult);
				};
				getOneToOneRelation[ormRelationGetter] = true;
				Object.defineProperty(output, relationName, { enumerable: true, configurable: true, get: getOneToOneRelation, set: (value) => { Object.defineProperty(output, relationName, { value }); } });
			}

			// Many-to-one owned relations
			for (const relationName of Object.keys(entityDefinition.manyToOne)) {
				const relation = entityDefinition.manyToOne[relationName];

				const relationRawFieldName = suffixId(camelCaseToSnakeCase(relationName as string));
				if (result[relationRawFieldName] == null) {
					if (!relation.nullable) throw new OrmError('ORM-1122', { entity: entityName as string, relation: relationName, operation: 'resolve-many-to-one' }, queryStatistics.queries);
					output[relationName] = null;
					continue;
				}

				const getManyToOneRelation = async () => {
					if (!transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, relation: relationName, operation: 'resolve-many-to-one' });

					if (ownedRelationCache.find(entityName, relationName) == null) {
						ownedRelationCache.overwrite(entityName, relationName, fetchManyToOneRelation(entityName, relationName));
					}
					const cached = await ownedRelationCache.find(entityName, relationName);
					if (cached == null) throw new OrmError('ORM-1001', { entity: entityName as string, relation: relationName, operation: 'resolve-many-to-one' });

					const rawResult = localCache.get(relation.entity, result[relationRawFieldName]);
					if (rawResult == null && !relation.nullable) {
						throw new OrmError('ORM-1121', { entity: entityName as string, relation: relationName, operation: 'resolve-many-to-one' }, queryStatistics.queries);
					}
					return rawResult == null ? null : createOutputTypeFromRawSqlType(relation.entity, rawResult);
				};
				getManyToOneRelation[ormRelationGetter] = true;
				Object.defineProperty(output, relationName, { enumerable: true, configurable: true, get: getManyToOneRelation, set: (value) => { Object.defineProperty(output, relationName, { value }); } });
			}

			// One-to-one inverse side
			for (const relationName of Object.keys(entityDefinition.oneToOneInverse)) {
				const relation = entityDefinition.oneToOneInverse[relationName];

				const getOneToOneInverseRelation = async () => {
					if (!transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-one-inverse' });

					if (inverseRelationCache.find(entityName, relationName) == null) {
						inverseRelationCache.overwrite(entityName, relationName, fetchOneToOneInverseRelation(entityName, relationName));
					}
					const cached = await inverseRelationCache.find(entityName, relationName);
					if (cached == null) throw new OrmError('ORM-1001', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-one-inverse' });

					const items = (cached.inverseMap[result.id as string] ?? []).map(item => localCache.get(relation.entity, item.id)).filter(x => x != null);
					if (items.length > 1) {
						throw new OrmError('ORM-1100', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-one-inverse' }, queryStatistics.queries);
					} else if (items.length == 0 && !relation.nullable) {
						throw new OrmError('ORM-1101', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-one-inverse' }, queryStatistics.queries);
					} else {
						const item = items[0] ?? null;
						return item != null ? createOutputTypeFromRawSqlType(relation.entity, item) : null;
					}
				};
				getOneToOneInverseRelation[ormRelationGetter] = true;
				Object.defineProperty(output, relationName, { enumerable: true, configurable: true, get: getOneToOneInverseRelation });
			}

			// One-to-many
			for (const relationName of Object.keys(entityDefinition.oneToMany)) {
				const relation = entityDefinition.oneToMany[relationName];

				const getOneToMany = async () => {
					if (!transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-many' });

					if (inverseRelationCache.find(entityName, relationName) == null) {
						inverseRelationCache.overwrite(entityName, relationName, fetchOneToManyRelation(entityName, relationName) as any);
					}
					const cached = await inverseRelationCache.find(entityName, relationName);
					if (cached == null) throw new OrmError('ORM-1001', { entity: entityName as string, relation: relationName, operation: 'resolve-one-to-many' });

					return (cached.inverseMap[result.id as string] ?? [])
						.map(rawEntity => localCache.get(relation.entity, rawEntity.id))
						.filter(cachedEntity => cachedEntity != null)
						.map(cachedEntity => createOutputTypeFromRawSqlType(relation.entity, cachedEntity!));
				};
				getOneToMany[ormRelationGetter] = true;
				Object.defineProperty(output, relationName, { enumerable: true, configurable: true, get: getOneToMany });
			}

			return output as OutputType<ED, EntityByName<ED, N>>;
		};
		
		/**
		 * Fetches a relation
		 * This will actually look at all entities in the local cache and do a select for all of them, meaning that after the first call to this
		 *  relations Promise<>, all other calls will be near-instant as they already exist in the transaction specific cache
		 * It is important to note that we assume that these prefetched entities won't chance during the transaction by an external source,
		 *  if our current transaction changes it by doing a write to the db, we should invalidate local cache (causing the next call to refetch)
		 * This might cause a performance bottleneck if you're doing a pattern of read -> for loop -> read relation in for loop, write within same loop -> next iteration,
		 *  because you'll actually fetch EVERYTHING in EVERY iteration of the for loop. This is a tradeoff we're making for simplicity and consistency.
		 * Ideally we detect this pattern and warn the developer about it.
		 */
		const fetchOneToOneOwnedRelation = async <N extends EntityName<ED>, R extends keyof EntityByName<ED, N>['oneToOneOwned']>(entityName: EntityName<ED>, relationName: R) => {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, relation: relationName as string, operation: 'fetch-one-to-one-owned' });
			relationCacheMisses++;

			const entityDefinition = this.entityDefinitions[entityName];
			const relationDefinition = entityDefinition.oneToOneOwned[relationName as string];

			// Fetch all base entities from local cache
			const loadedEntities = localCache.getAllOfType(entityName);

			// Fetch all base entities from local cache
			const relationRawFieldName = suffixId(camelCaseToSnakeCase(relationName as string));
			const idsToFetch = [ ...new Set(loadedEntities.map(le => le[relationRawFieldName]).filter(id => id != null)) ];

			// Fetch the relation
			const output = idsToFetch.length == 0 ? [] : await nativeQuery({ sql: `select * from "${camelCaseToSnakeCase(relationDefinition.entity)}" where "id" = any($1)`, params: [ idsToFetch ] });

			// Update local entity cache
			updateCacheWithNewEntities(relationDefinition.entity, output);

			return output.map(r => r.id.toString());
		};

		// @see fetchOneToOneOwnedRelation
		const fetchManyToOneRelation = async <N extends EntityName<ED>, R extends keyof EntityByName<ED, N>['manyToOne']>(entityName: EntityName<ED>, relationName: R) => {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, relation: relationName as string, operation: 'fetch-many-to-one' });
			relationCacheMisses++;

			const entityDefinition = this.entityDefinitions[entityName];
			const relationDefinition = entityDefinition.manyToOne[relationName as string];

			// Fetch all base entities from local cache
			const loadedEntities = localCache.getAllOfType(entityName);

			// Fetch all base entities from local cache
			const relationRawFieldName = suffixId(camelCaseToSnakeCase(relationName as string));
			const idsToFetch = [ ...new Set(loadedEntities.map(le => le[relationRawFieldName]).filter(id => id != null)) ];

			// Fetch the relation
			const output = idsToFetch.length == 0 ? [] : await nativeQuery({ sql: `select * from "${camelCaseToSnakeCase(relationDefinition.entity)}" where "id" = any($1)`, params: [ idsToFetch ] });

			// Update local entity cache
			updateCacheWithNewEntities(relationDefinition.entity, output);

			return output.map(r => r.id.toString());
		};

		// @see fetchOneToOneOwnedRelation
		const fetchOneToOneInverseRelation = async <N extends EntityName<ED>, R extends keyof EntityByName<ED, N>['oneToOneInverse']>(entityName: EntityName<ED>, relationName: R) => {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, relation: relationName as string, operation: 'fetch-one-to-one-inverse' });
			relationCacheMisses++;

			const entityDefinition = this.entityDefinitions[entityName];
			const relationDefinition = entityDefinition.oneToOneInverse[relationName as string];

			// Fetch all base entities from local cache
			const loadedEntities = localCache.getAllOfType(entityName);

			// Do a different query depending on the type of relation (and where the owning side lives)
			const inverse: string = relationDefinition.inverse;
			const idsToFetch = [ ...new Set(loadedEntities.map(le => le['id']).filter(id => id != null)) ];

			// Execute query
			const columnName = suffixId(camelCaseToSnakeCase(inverse));
			const output = idsToFetch.length == 0 ? [] : await nativeQuery({ sql: `select * from "${camelCaseToSnakeCase(relationDefinition.entity)}" where "${columnName}" = any($1)`, params: [ idsToFetch ] });

			// Update local entity cache
			updateCacheWithNewEntities(relationDefinition.entity, output);

			const inverseMap: Record<string, typeof output> = {};
			for (const outputRecord of output) {
				if (inverseMap[outputRecord[columnName]] == null) inverseMap[outputRecord[columnName]] = [];
				inverseMap[outputRecord[columnName]].push(outputRecord);
			}

			return {
				ids: output.map(r => r.id.toString()),
				inverseMap,
			};
		};

		// @see fetchOneToOneOwnedRelation
		const fetchOneToManyRelation = async <N extends EntityName<ED>, R extends keyof EntityByName<ED, N>['oneToMany']>(entityName: EntityName<ED>, relationName: R) => {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, relation: relationName as string, operation: 'fetch-one-to-many' });
			relationCacheMisses++;

			const entityDefinition = this.entityDefinitions[entityName];
			const relationDefinition = entityDefinition.oneToMany[relationName as string];

			// Fetch all base entities from local cache
			const loadedEntities = localCache.getAllOfType(entityName);

			// Do a different query depending on the type of relation (and where the owning side lives)
			const inverse: string = relationDefinition.inverse;
			const idsToFetch = [ ...new Set(loadedEntities.map(le => le['id']).filter(id => id != null)) ];

			// Execute query
			const columnName = suffixId(camelCaseToSnakeCase(inverse));
			const output = idsToFetch.length == 0 ? [] : await nativeQuery({ sql: `select * from "${camelCaseToSnakeCase(relationDefinition.entity)}" where "${columnName}" = any($1)`, params: [ idsToFetch ] });

			// Update local entity cache
			updateCacheWithNewEntities(relationDefinition.entity, output);

			const inverseMap: Record<string, typeof output> = {};
			for (const outputRecord of output) {
				if (inverseMap[outputRecord[columnName]] == null) inverseMap[outputRecord[columnName]] = [];
				inverseMap[outputRecord[columnName]].push(outputRecord);
			}

			return {
				ids: output.map(r => r.id.toString()),
				inverseMap,
			};
		};

		const updateCacheWithNewEntities = <N extends EntityName<ED>>(entityName: N, results: RawSqlType<ED, EntityByName<ED, N>>[]) => {
			let newlyInserted = false;
			for (let i = 0; i < results.length; i++) {
				const typeOfSave = localCache.save(entityName, results[i]['id']!, results[i]);
				if (typeOfSave == 'NEW') newlyInserted = true;
			}

			// If we loaded any new data, that means any fetched relations with that entity as its origin are now out of date, we should no longer cache those
			// In the future we may do interesting things like partial fetches, but for now we just invalidate the entire thing
			if (newlyInserted) {
				ownedRelationCache.invalidateForEntity(entityName);
				inverseRelationCache.invalidateForEntity(entityName);
			}
		};

		/**
		 * User facing function, fetches a single entity from the database
		 * This function will throw if the entity is not found
		 */
		async function findOne<N extends EntityName<ED>>(entityName: N, id: string): Promise<OutputType<ED, EntityByName<ED, N>>> {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, operation: 'findOne' });

			const rows = await nativeQuery({ sql: `select * from "${camelCaseToSnakeCase(entityName as string)}" where "id" = $1`, params: [ id ] });
			if (rows == null || rows.length == 0) throw new OrmError('ORM-1200', { entity: entityName as string, operation: 'findOne' });
			if (rows.length > 1) throw new OrmError('ORM-1201', { entity: entityName as string, operation: 'findOne' });

			// Update the loaded entities cache
			updateCacheWithNewEntities(entityName, rows);

			return createOutputTypeFromRawSqlType(entityName, rows[0]) as any;
		}

		/**
		 * Fetches a single entity from the database, but returns null if the entity is not found
		 */
		async function findOneOrNull<N extends EntityName<ED>>(entityName: N, id: string): Promise<OutputType<ED, EntityByName<ED, N>> | null> {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, operation: 'findOneOrNull' });

			const rows = await nativeQuery({ sql: `select * from "${camelCaseToSnakeCase(entityName as string)}" where "id" = $1`, params: [ id ] });
			if (rows == null || rows.length == 0) return null;
			if (rows.length > 1) throw new OrmError('ORM-1201', { entity: entityName as string, operation: 'findOneOrNull' });

			// Update the loaded entities cache
			updateCacheWithNewEntities(entityName, rows);

			return createOutputTypeFromRawSqlType(entityName, rows[0]) as OutputType<ED, EntityByName<ED, N>>;
		}

		/**
		 * Fetches a list of entities from the database by their IDs
		 */
		async function findByIds<N extends EntityName<ED>>(entityName: N, ids: string[]) {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, operation: 'findByIds' });
			if (ids.length == 0) return []; // shortcircuit if no IDs are provided

			const rows = await nativeQuery({ sql: `select * from "${camelCaseToSnakeCase(entityName as string)}" where "id" = any($1)`, params: [ ids ] });
			if (rows.length != ids.length) throw new OrmError('ORM-1202', { entity: entityName as string, operation: 'findByIds' });

			// Update the loaded entities cache
			updateCacheWithNewEntities(entityName, rows);

			return rows.map(r => createOutputTypeFromRawSqlType(entityName, r)) as OutputType<ED, EntityByName<ED, N>>[];
		}

		/**
		 * Fetches multiple entities from the database
		 */
		async function findMany<N extends EntityName<ED>>(entityName: N, options?: FindManyOptions<ED, EntityByName<ED, N>>): Promise<OutputType<ED, EntityByName<ED, N>>[]> {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, operation: 'findMany' });

			const empty: SqlStatement = { sql: '', params: [] };
			const sqlStatement = mergeSql(
				{ sql: `select * from "${camelCaseToSnakeCase(entityName as string)}"`, params: [] },
				options?.where != null ? mergeSql({ sql: 'where', params: [] }, whereClauseToSql(options.where)) : empty,
				options?.orderBy != null ? mergeSql({ sql: 'order by', params: [] }, orderByToSql(options.orderBy)) : empty,
				options != null && 'offset' in options && options.offset != null ? { sql: 'offset $1', params: [ options.offset ] } : empty,
				options != null && 'limit' in options && options.limit != null ? { sql: 'limit $1', params: [ options.limit ] } : empty,
			);
			const rows = await nativeQuery(sqlStatement);

			// Update loaded entities cache
			updateCacheWithNewEntities(entityName, rows);

			// Output the fetched entities as full entity objects
			return rows.map(r => createOutputTypeFromRawSqlType(entityName, r)) as OutputType<ED, EntityByName<ED, N>>[];
		}

		/**
		 * Counts the amount of entities filtered by the where clause
		 * Has no orderby, offset, or limit, because none of those affect the count() of the full query
		 */
		async function count<N extends EntityName<ED>>(entityName: N, options?: { where?: WhereClause<ED, EntityByName<ED, N>> }): Promise<number> {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, operation: 'count' });

			const empty: SqlStatement = { sql: '', params: [] };
			const sqlStatement = mergeSql(
				{ sql: `select count("id") as "amount" from "${camelCaseToSnakeCase(entityName as string)}"`, params: [] },
				options?.where != null ? mergeSql({ sql: 'where', params: [] }, whereClauseToSql(options.where)) : empty,
			);
			const rows = await nativeQuery(sqlStatement);
			return rows[0]['amount'];
		}

		/**
		 * Finds both a limited amount of entities and the total amount of entities that match the where clause
		 * This can be useful in paginated contexts=
		 */
		async function findManyAndCount<N extends EntityName<ED>>(entityName: N, options?: FindManyOptions<ED, EntityByName<ED, N>>): Promise<{ results: OutputType<ED, EntityByName<ED, N>>[], total: number }> {
			const results = await findMany(entityName, options);
			const total = await count(entityName, options == null ? undefined : { where: options?.where });
			return { results, total };
		}

		/**
		 * Executes a native query against the database and gives back the result as an array of objects
		 */
		async function nativeQuery(statement: SqlStatement): Promise<any[]> {
			if (transactionControls == null) throw new OrmError('ORM-1000', { operation: 'nativeQuery' });

			const stats = { query: statement.sql, params: statement.params, durationInMs: Infinity };
			queryStatistics.queries.push(stats);

			const startTime = process.hrtime();
			const result = await transactionControls.query(statement.sql, statement.params);
			const duration = process.hrtime(startTime);
			stats.durationInMs = ((duration[0] * 1000) + (duration[1] / 1000000));

			return result.rows;
		}

		/**
		 * Saves a single entity
		 */
		async function saveOne<N extends EntityName<ED>>(entityName: N, entity: InputType<ED, EntityByName<ED, N>>): Promise<OutputType<ED, EntityByName<ED, N>>> {
			const results = await saveMany(entityName, [ entity ]);
			if (results.length < 1) throw new OrmError('ORM-1300', { entity: entityName as string, operation: 'saveOne' }, queryStatistics.queries);
			return results[0];
		}

		/**
		 * Saves a multiple entities
		 * Should always accept OutputType<E> or OutputType<E>[] as inputs so we can always fetch and immediately save the result of a findOne/findMany
		 * In addition, we should define various input types to allow for updates from manually created objects that satisfy the shape of the entity
		 */
		const saveMany = async <N extends EntityName<ED>>(entityName: N, entities: InputType<ED, EntityByName<ED, N>>[]): Promise<OutputType<ED, EntityByName<ED, N>>[]> => {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, operation: 'saveMany' });
			const entityDefinition = this.entityDefinitions[entityName];
			const tableName = camelCaseToSnakeCase(entityName as string);

			// For each entity we should determine which fields to save, this is at minimum the basic fields in the entity, and any fields that contain either a resolved promise and are owned
			const rawEntities = await Promise.all(entities.filter(e => e != null).map(async (e: Record<string, any>) => {
				const rawEntityFieldsToWrite: Record<string, any> = {};

				// Read the basic fields for the entity
				for (const field of Object.keys(entityDefinition.fields)) {
					const fieldDefinition = entityDefinition.fields[field];
					if (field == 'id' && e[field] == null) continue; // We don't want to set the ID to null

					if (e[field] == null && !entityDefinition.fields[field].nullableOnInput) {
						throw new OrmError('ORM-1301', { entity: entityName as string, field, operation: 'saveMany' }, queryStatistics.queries);
					}

					// Check if we are using a custom type converter, if so, use that to serialize to SQL string
					rawEntityFieldsToWrite[camelCaseToSnakeCase(field)] = e[field] == null ? null : fieldDefinition.fromType(e[field]);
				}

				// Support for setting relations
				for (const relation of Object.keys(entityDefinition.oneToOneOwned)) {
					const relationDefinition = entityDefinition.oneToOneOwned[relation];
					const relationRawFieldName = suffixId(camelCaseToSnakeCase(relation));

					// If the relation is a getter for fetching the relation, we should be careful and try to see if the dev has actually fetched and modified the relation before saving
					// Right now we assume they haven't, but we should probably check the local cache, see if this relation was ever fetched, and if so try and see if the values were modified
					if (isOrmRelationGetter(e, relation)) continue;

					// If the relation is nullable and the value is null, we should set the field to null
					const resolvedRelation: any = await e[relation];
					if (!relationDefinition.nullable && resolvedRelation == null) throw new OrmError('ORM-1302', { entity: entityName as string, relation, operation: 'saveMany' }, queryStatistics.queries);
					if (resolvedRelation != null && resolvedRelation.id == null) throw new OrmError('ORM-1303', { entity: entityName as string, relation, operation: 'saveMany' }, queryStatistics.queries);
					rawEntityFieldsToWrite[relationRawFieldName] = resolvedRelation?.id ?? null;
				}

				for (const relation of Object.keys(entityDefinition.manyToOne)) {
					const relationDefinition = entityDefinition.manyToOne[relation];
					const relationRawFieldName = suffixId(camelCaseToSnakeCase(relation));

					// If the relation is a getter for fetching the relation, we should be careful and try to see if the dev has actually fetched and modified the relation before saving
					// Right now we assume they haven't, but we should probably check the local cache, see if this relation was ever fetched, and if so try and see if the values were modified
					if (isOrmRelationGetter(e, relation)) continue;

					// If the relation is nullable and the value is null, we should set the field to null
					const resolvedRelation: any = await e[relation];
					if (!relationDefinition.nullable && resolvedRelation == null) throw new OrmError('ORM-1304', { entity: entityName as string, relation, operation: 'saveMany' }, queryStatistics.queries);
					if (resolvedRelation != null && resolvedRelation.id == null) throw new OrmError('ORM-1305', { entity: entityName as string, relation, operation: 'saveMany' }, queryStatistics.queries);
					rawEntityFieldsToWrite[relationRawFieldName] = resolvedRelation?.id ?? null;
				}

				return rawEntityFieldsToWrite;
			}));

			// Split the entities into two groups, one for insert and one for update
			const entitiesToInsert = rawEntities.filter(e => e['id'] == null);
			const entitiesToUpdate = rawEntities.filter(e => e['id'] != null);

			// Insert new entities
			const rows = [];
			if (entitiesToInsert.length > 0) {
				// Generate field names to insert, leaving out fields that are nullable on input and are null for the entire batch
				const rawFields = Object.keys(entitiesToInsert[0])
					.filter(rawFieldName => entityDefinition.fields[snakeCaseToCamelCase(rawFieldName)] == null || !entityDefinition.fields[snakeCaseToCamelCase(rawFieldName)].nullableOnInput || entitiesToInsert.some(e => e[rawFieldName] != null));

				let insertResult;
				if (rawFields.length > 0) {
					// Generate values to insert
					let paramCounter = 0;
					const valuesSqlString = entitiesToInsert.map(_ => {
						const params = [];
						for (let i = 0; i < rawFields.length; i++) {
							paramCounter++;
							params.push(`$${paramCounter}`);
						}
						return '(' + params.join(',') + ')';
					}).join(', ');
					const rawValues = entitiesToInsert.flatMap(e => rawFields.map(f => e[f] ?? null));

					const insertQuery = `insert into "${tableName}" (${rawFields.map(f => format(`%I`, f)).join(', ')}) values ${valuesSqlString} returning *`;
					if (this.auditLoggingEnabled) {
						const auditWrappedInsertQuery = `
							with inserted_rows as (
								${insertQuery}
							), audit_log_insertions as (
								insert into audit_log (timestamp, transaction_id, "table", entity_id, type, diff, metadata)
									select
										now(),
										txid_current(),
										'${tableName}',
										inserted_rows.id,
										'INSERT',
										(select jsonb_object_agg(new.key, jsonb_build_object('old', null, 'new', new_value)) as changed_fields 
											from inserted_rows, jsonb_each(to_jsonb(inserted_rows)) as new(key, new_value)
										),
										${format(`%L`, JSON.stringify(auditMetadata))}
									from inserted_rows
							)
							select * from inserted_rows;
						`;
						insertResult = await nativeQuery({ sql: auditWrappedInsertQuery, params: rawValues });
						rows.push(...insertResult);
					} else {
						insertResult = await nativeQuery({ sql: insertQuery, params: rawValues });
						rows.push(...insertResult);
					}
				} else {
					const insertQuery = `insert into "${tableName}" default values returning *`;
					if (this.auditLoggingEnabled) {
						const auditWrappedInsertQuery = `
							with inserted_rows as (
								${insertQuery}
							), audit_log_insertions as (
								insert into audit_log (timestamp, transaction_id, "table", entity_id, type, diff, metadata)
								select
									now(),
									txid_current(),
									'${tableName}',
									inserted_rows.id,
									'INSERT',
									(select jsonb_object_agg(new.key, jsonb_build_object('old', null, 'new', new_value)) as changed_fields 
										from inserted_rows, jsonb_each(to_jsonb(inserted_rows)) as new(key, new_value)
									),
									${format(`%L`, JSON.stringify(auditMetadata))}
									from inserted_rows
							)
							select * from inserted_rows;
						`;
						insertResult = await nativeQuery({ sql: auditWrappedInsertQuery, params: [] });
						rows.push(...insertResult);
					} else {
						insertResult = await nativeQuery({ sql: insertQuery, params: [] });
						rows.push(...insertResult);
					}
				}

				// Update the list of changes
				changedEntities.addInsertedEntities(entityName, insertResult.map(r => r.id));

				// Update the loaded entities cache
				updateCacheWithNewEntities(entityName, insertResult);

				// Also invalidate inverse relations for the fetched entities, since these might now yield new results as part of this new entity
				ownedRelationCache.invalidateByCondition((rcEntityName, rcRelationName) => {
					if (rcEntityName == entityName) return true;
					return this.entityDefinitions[rcEntityName].oneToOneInverse[rcRelationName as string]?.entity == entityName || this.entityDefinitions[rcEntityName].oneToMany[rcRelationName as string]?.entity == entityName;
				});
				inverseRelationCache.invalidateByCondition((rcEntityName, rcRelationName) => {
					if (rcEntityName == entityName) return true;
					return this.entityDefinitions[rcEntityName].oneToOneInverse[rcRelationName as string]?.entity == entityName || this.entityDefinitions[rcEntityName].oneToMany[rcRelationName as string]?.entity == entityName;
				});
			}

			// Update existing entities
			if (entitiesToUpdate.length > 0) {
				// It's pretty ugly that we're doing the escaping here instead of using parameters,
				//  but we need that because we can't execute multiple update statements AND use parameterized queries at the same time
				// So the choice is either execute a separate query for each entity, or do this
				const updateQueries: SqlStatement[] = entitiesToUpdate.map(e => {
					const rawFields = Object.keys(e).filter(f => f != 'id');
					let updateQuery = `update "${tableName}" set ${rawFields.map((f, i) => format(`%I = %L`, f, prepValueForPgFormat(e[f]))).join(', ')} where "id" = ${format('%L', e['id'])} returning *`;

					if (this.auditLoggingEnabled) {
						// This query is much bigger than the non-audit version, so perhaps this may cause trouble if we batch update loads of entities in one go
						// If any issues with that pop up, we should probably implement a batching strategy that takes into account a max query length or so and splits up
						//  updates into multiple round trips to the database
						updateQuery = `
							with new_row as (
								${updateQuery}
							),
							old_row as (
								select * from "${tableName}" where "id" = ${format('%L', e['id'])}
							),
							diff as (
								select jsonb_object_agg(new.key, jsonb_build_object('old', old_val, 'new', new_val)) as changed_fields
								from old_row, new_row, jsonb_each(to_jsonb(old_row)) AS old(key, old_val)
								join jsonb_each(to_jsonb(new_row)) as new(key, new_val)
								on old.key = new.key
								where old_val is distinct from new_val
							),
							audit_log_insertion as (
								insert into audit_log (timestamp, transaction_id, "table", entity_id, type, diff, metadata)
								select
									now(),
									txid_current(),
									'${tableName}',
									${format('%L', e['id'])},
									'UPDATE',
									(
										select coalesce(jsonb_object_agg(new.key, jsonb_build_object('old', old_val, 'new', new_val)), '{}'::jsonb) as changed_fields
										from old_row, new_row, jsonb_each(to_jsonb(old_row)) AS old(key, old_val)
										join jsonb_each(to_jsonb(new_row)) as new(key, new_val)
										on old.key = new.key
										where old_val is distinct from new_val
									),
									${format(`%L`, JSON.stringify(auditMetadata))}
									from new_row
							)
							select * from new_row;
						`;
					}

					return { sql: updateQuery, params: [] };
				});

				// Execute all the updates in batch
				const updateResult = await nativeQuery({ sql: updateQueries.map(q => q.sql).join('; '), params: [] });
				rows.push(...updateResult);

				// Update the list of changes
				changedEntities.addUpdatedEntities(entityName, updateResult.map(r => r.id));

				// Update the loaded entities cache
				updateCacheWithNewEntities(entityName, updateResult);

				// Also invalidate inverse relations for the fetched entities, since these might now yield new results as part of this changed entity
				ownedRelationCache.invalidateByCondition((rcEntityName, rcRelationName) => {
					if (rcEntityName == entityName) return true;
					return this.entityDefinitions[rcEntityName].oneToOneInverse[rcRelationName as string]?.entity == entityName || this.entityDefinitions[rcEntityName].oneToMany[rcRelationName as string]?.entity == entityName;
				});
				inverseRelationCache.invalidateByCondition((rcEntityName, rcRelationName) => {
					if (rcEntityName == entityName) return true;
					return this.entityDefinitions[rcEntityName].oneToOneInverse[rcRelationName as string]?.entity == entityName || this.entityDefinitions[rcEntityName].oneToMany[rcRelationName as string]?.entity == entityName;
				});
			}

			return rows.map(row => createOutputTypeFromRawSqlType(entityName, row)) as OutputType<ED, EntityByName<ED, N>>[];
		};

		function prepValueForPgFormat(input: any): any {
			if (input != null && input instanceof Date) return input.toISOString();
			return input;
		}

		/**
		 * Deletes a list of entities by it IDs
		 */
		async function deleteByIds<N extends EntityName<ED>>(entityName: N, ids: string[]): Promise<void> {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, operation: 'deleteByIds' });
			if (ids.length == 0) return;

			return deleteMany(entityName, { where: sql`id = any(${ids})` });
		}

		/**
		 * Deletes a list of entities for a given where clause
		 */
		const deleteMany = async <N extends EntityName<ED>>(entityName: N, options: { where: WhereClause<ED, EntityByName<ED, N>> }): Promise<void> => {
			if (transactionControls == null) throw new OrmError('ORM-1000', { entity: entityName as string, operation: 'deleteWhere' });
			const tableName = camelCaseToSnakeCase(entityName as string);

			let sqlStatement = mergeSql({ sql: `delete from ${tableName} where`, params: [] }, whereClauseToSql(options.where), { sql: `returning *`, params: [] });
			if (this.auditLoggingEnabled) {
				sqlStatement = {
					sql: `
						with deleted_rows as (
							${sqlStatement.sql}
						), audit_log_insertions as (
							insert into audit_log (timestamp, transaction_id, "table", entity_id, type, diff, metadata)
								select
									now(),
									txid_current(),
									'${tableName}',
									deleted_rows.id,
									'DELETE',
									(select jsonb_object_agg(old.key, jsonb_build_object('old', old_value, 'new', null)) as changed_fields 
										from deleted_rows, jsonb_each(to_jsonb(deleted_rows)) as old(key, old_value)
									),
									${format(`%L`, JSON.stringify(auditMetadata))}
								from deleted_rows
						)
						select * from deleted_rows;
					`,
					params: sqlStatement.params,
				};
			}
			const result = await nativeQuery(sqlStatement);
			const deletedIds = result.map(r => r.id.toString());

			// Just removing the relevant entities from local cache should be enough
			// Because delete is a destructive operation, it should never happen that new, not-yet-loaded-in-cache entities should pop up in a cached relation
			// Therefore we don't need to bust the entire relation cache
			const idSet = new Set(deletedIds);
			idSet.forEach(id => localCache.remove(entityName, id));

			// Update the list of changes
			changedEntities.addDeletedEntities(entityName, deletedIds);
		};

		/**
		 * Running this function will check the entity definitions against the database schema
		 * and provide a report to the caller to see if the schema matches expectations
		 * Whenever the valid flag is true, the application is safe to boot up
		 * @returns A SchemaValidationResult object
		 */
		const validateSchema = async (schemaName?: string): Promise<SchemaValidationResult> => validateSchemaActual(this.entityDefinitions, nativeQuery, schemaName);

		transactionControls = await this.driver.startTransaction();
		try {
			// Execute the main transaction function
			const dbFunctions: DbFunctions<ED> = {
				findOne, findOneOrNull, findByIds,
				findMany, count, findManyAndCount,
				nativeQuery,
				saveOne, saveMany,
				deleteByIds, deleteMany,
				validateSchema,
				transactionStatistics: queryStatistics,
			};

			// Main transaction execution
			const passthroughReturnType = await executor(dbFunctions);

			// Run the beforeCommit event listeners
			for (const listener of transactionConfig?.beforeCommitListeners ?? []) {
				await listener(changedEntities, dbFunctions);
			}

			// Warn if we have a lot of relation cache misses
			if (relationCacheMisses > 100 && process.env.NODE_ENV != 'production') {
				this.emit('warning', {
					code: 'ORM-2000',
					message: '[ORM-2000] A transaction had a large amount of relation cache misses (>100), this might be a performance issue. Check if you have not accidentally created a pattern where you are doing something to cause a cache invalidation in a loop or something like that. Looking at the query statistics is a good starting point to see which queries are getting executed a lot. This warning is only triggered if NODE_ENV is not "production".',
					queryStatistics,
				});
			}

			// Make sure all relation resolvers are finished before terminating transaction
			await ownedRelationCache.waitForAllResolved();
			await inverseRelationCache.waitForAllResolved();

			await transactionControls.commit();
			transactionControls = null;

			// Run the afterCommit event listeners
			// This should run after the current function completes though, hence the setTimeout()
			setTimeout(() => {
				(transactionConfig?.afterCommitListeners ?? []).forEach(listener => {
					this.inTransaction(
						(dbFunc) => listener(changedEntities, dbFunc).catch(e => this.emit('error', { message: 'Uncaught error in afterCommit listener', error: e })),
						{ ...transactionConfig, afterCommitListeners: [] },
					);
				});

				(transactionConfig?.afterCommitListenersNonTransactional ?? []).forEach(listener => {
					listener(changedEntities, transactionConfig ?? {}).catch(e => this.emit('error', { message: 'Uncaught error in afterCommit listener', error: e }));
				});
			}, 0);

			return passthroughReturnType;
		} catch (e) {
			try {
				this.emit('error', {
					message: 'Error in transaction',
					error: e,
					queryStatistics,
				});
			} catch (emitError) {
				// We'll try to emit the error, but if we can't, we'll just ignore it
			}
			if (transactionControls != null) {
				await transactionControls.rollback();
				transactionControls = null;
			}
			throw e;
		} finally {
			if (transactionControls != null) await transactionControls.rollback();
			transactionControls = null;
		}
	}
}

export { ChangeTracker } from './transaction/ChangeTracker.js';
export { defineAutogeneratedField, defineCustomField, defineEntity, defineField, defineIdField } from './entities/BaseEntity.js';
export { sql } from './helpers/sql.js';
export { unwrap, unwrapAll } from './helpers/unwrap.js';
export { InputType } from './types/InputType.js';
export { OutputType } from './types/OutputType.js';
export { RawSqlType } from './types/RawSqlType.js';