import { BaseEntityDefinitions } from "./BaseEntityDefinitions.js";

// Entity helper types
export type EntityName<ED extends BaseEntityDefinitions> = keyof ED;
export type EntityDefinition<ED extends BaseEntityDefinitions> = ED[EntityName<ED>];
export type EntityByName<ED extends BaseEntityDefinitions, K extends EntityName<ED>> = ED[K];