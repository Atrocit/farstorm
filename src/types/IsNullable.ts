import { Nullable } from "../entities/Nullable.js";

export type IsNullable<T extends Nullable> = T extends true | 'NULLABLE' ? null : never;