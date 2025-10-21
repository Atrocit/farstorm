import { BaseEntityDefinitions } from "./BaseEntityDefinitions.js";
import { EntityByName, EntityDefinition } from "./EntityTypes.js";
import { EvalGeneric } from "./EvalGeneric.js";
import { FieldType } from "./FieldTypes.js";
import { OutputTypeRef } from "./OutputType.js";
import { WithOptionalId } from "./WithOptionalId.js";

// Define input type for save functions
type InputTypeFields<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> =
	{ -readonly [N in keyof E['fields'] as E['fields'][N]['nullableOnInput'] extends true ? never : N]: FieldType<ED, E, N> } // mandatory properties
	& { -readonly [N in keyof E['fields'] as E['fields'][N]['nullableOnInput'] extends true ? N : never]?: FieldType<ED, E, N> | null | undefined }; // optionals

type InputTypeOneToOneOwned<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> =
	{ -readonly [N in keyof E['oneToOneOwned'] as E['oneToOneOwned'][N]['nullable'] extends true ? never : N]: OutputTypeRef<ED, EntityByName<ED, E['oneToOneOwned'][N]['entity']>> } // mandatory properties
	& { -readonly [N in keyof E['oneToOneOwned'] as E['oneToOneOwned'][N]['nullable'] extends true ? N : never]?: OutputTypeRef<ED, EntityByName<ED, E['oneToOneOwned'][N]['entity']>> | null | undefined }; // optionals

type InputTypeManyToOne<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> =
	{ -readonly [N in keyof E['manyToOne'] as E['manyToOne'][N]['nullable'] extends true ? never : N]: OutputTypeRef<ED, EntityByName<ED, E['manyToOne'][N]['entity']>> } // mandatory properties
	& { -readonly [N in keyof E['manyToOne'] as E['manyToOne'][N]['nullable'] extends true ? N : never]?: OutputTypeRef<ED, EntityByName<ED, E['manyToOne'][N]['entity']>> | null | undefined }; // optionals

export type InputTypeWithId<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> =
	InputTypeFields<ED, E> & InputTypeOneToOneOwned<ED, E> & InputTypeManyToOne<ED, E> & {
		-readonly [N in keyof E['oneToOneInverse']]?: any /* Allow feeding something, but we don't care what exactly since we won't save it. We could narrow this to identical to OutputType<> */
	} & {
		-readonly [N in keyof E['oneToMany']]?: any /* Allow feeding something, but we don't care what exactly since we won't save it. We could narrow this to identical to OutputType<> */
	};

export type InputType<ED extends BaseEntityDefinitions, E extends EntityDefinition<ED>> = EvalGeneric<WithOptionalId<InputTypeWithId<ED, E>>>;