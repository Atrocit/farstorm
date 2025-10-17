import { BaseEntityDefinitions } from "./BaseEntityDefinitions.js";
import { EntityDefinition } from "./EntityTypes.js";
import { IsNullable } from "./IsNullable.js";

// Helper types to get field properties for a specific entity
export type Fields<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = E['fields'];
export type FieldNames<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = keyof Fields<ED, E>;
export type Field<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>, N extends FieldNames<ED, E>> = Fields<ED, E>[N];
export type FieldType<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>, N extends FieldNames<ED, E>> = ReturnType<Field<ED, E, N>['toType']>;
export type FieldNullNever<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>, N extends FieldNames<ED, E>> = IsNullable<Field<ED, E, N>['nullableOnOutput']>;
