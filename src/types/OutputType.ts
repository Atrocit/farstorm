import { BaseEntityDefinitions } from "./BaseEntityDefinitions.js";
import { EntityByName, EntityDefinition } from "./EntityTypes.js";
import { EvalGeneric } from "./EvalGeneric.js";
import { FieldNullNever, FieldType } from "./FieldTypes.js";
import { IsNullable } from "./IsNullable.js";

// Prep the output type for a specific entity
// Defines a type for every field on a given entity, including correctly nullability setting
// Defines the types for all relations, which will something like Promise<TargetEntity> or Promise<TargetEntity[]>, depending on the relation type, with correct nullability
export type OutputType<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = EvalGeneric<{
	-readonly [N in keyof E['fields']]: FieldType<ED, E, N> | FieldNullNever<ED, E, N>
} & {
	-readonly [N in keyof E['oneToOneOwned']]: Promise<OutputType<ED, EntityByName<ED, E['oneToOneOwned'][N]['entity']>>> | IsNullable<E['oneToOneOwned'][N]['nullable']>
} & {
	-readonly [N in keyof E['oneToOneInverse']]: Promise<OutputType<ED, EntityByName<ED, E['oneToOneInverse'][N]['entity']>> | IsNullable<E['oneToOneInverse'][N]['nullable']>>
} & {
	-readonly [N in keyof E['manyToOne']]: Promise<OutputType<ED, EntityByName<ED, E['manyToOne'][N]['entity']>>> | IsNullable<E['manyToOne'][N]['nullable']>
} & {
	[N in keyof E['oneToMany']]: Promise<OutputType<ED, EntityByName<ED, E['oneToMany'][N]['entity']>>[]>
}>;

export type OutputTypeRef<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = Promise<OutputType<ED, E>> | OutputType<ED, E>;