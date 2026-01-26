import { BaseEntityDefinitions } from "./BaseEntityDefinitions.js";
import { EntityDefinition } from "./EntityTypes.js";
import { EvalGeneric } from "./EvalGeneric.js";
import { FieldNullNever, FieldType } from "./FieldTypes.js";
import { IsNullable } from "./IsNullable.js";

export type OutputTypeByName<ED extends BaseEntityDefinitions> = {
	[N in keyof ED]: OutputType<ED, ED[N]>
};

// Prep the output type for a specific entity
// Defines a type for every field on a given entity, including correctly nullability setting
// Defines the types for all relations, which will something like Promise<TargetEntity> or Promise<TargetEntity[]>, depending on the relation type, with correct nullability
export type OutputType<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = EvalGeneric<{
	-readonly [N in keyof E['fields']]: FieldType<ED, E, N> | FieldNullNever<ED, E, N>
} & {
	-readonly [N in keyof E['oneToOneOwned']]: Promise<OutputTypeByName<ED>[E['oneToOneOwned'][N]['entity']]> | IsNullable<E['oneToOneOwned'][N]['nullable']>
} & {
	-readonly [N in keyof E['oneToOneInverse']]: Promise<OutputTypeByName<ED>[E['oneToOneInverse'][N]['entity']] | IsNullable<E['oneToOneInverse'][N]['nullable']>>
} & {
	-readonly [N in keyof E['manyToOne']]: Promise<OutputTypeByName<ED>[E['manyToOne'][N]['entity']]> | IsNullable<E['manyToOne'][N]['nullable']>
} & {
	[N in keyof E['oneToMany']]: Promise<OutputTypeByName<ED>[E['oneToMany'][N]['entity']][]>
}>;

export type OutputTypeRef<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = Promise<OutputType<ED, E>> | OutputType<ED, E>;
export type OutputTypeRefByName<ED extends BaseEntityDefinitions, N extends keyof ED> = Promise<OutputTypeByName<ED>[N]> | OutputTypeByName<ED>[N];