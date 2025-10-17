import { CamelToSnakeCase, IdSuffixed } from "../util/strings.js";
import { BaseEntityDefinitions } from "./BaseEntityDefinitions.js";
import { EntityDefinition } from "./EntityTypes.js";
import { IsNullable } from "./IsNullable.js";

// Construct the RawSqlType, which is a type definition that encompasses what is returned from a SQL-query
// Currently any types for OneToMany relations that aren't defined as a ManyToOne on the other side are missing
//  (e.g if B defines a OneToMany to A, then A will not have a field for this relation, even though in reality there will be a b_id column in the table for A)
// The clunky N extends string stuff is to ensure TypeScript does not get confused. Even though the keys of FieldNames<> and such are always strings,
//  for some reason TS tries to use the default key type (symbol | number | string) instead of the more narrow string we know it to be.
export type RawSqlType<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = {
	-readonly [N in keyof E['fields'] as CamelToSnakeCase<Extract<N, string>>]: ReturnType<E['fields'][N]['toType']> | IsNullable<E['fields'][N]['nullableOnOutput']>
} & {
	-readonly [N in keyof E['oneToOneOwned'] as IdSuffixed<CamelToSnakeCase<Extract<N, string>>>]: number | IsNullable<E['oneToOneOwned'][N]['nullable']>
} & {
	-readonly [N in keyof E['manyToOne'] as IdSuffixed<CamelToSnakeCase<Extract<N, string>>>]: number | IsNullable<E['manyToOne'][N]['nullable']>
};