export type IsNotNull = false | 'NOT NULL';
export type IsNullable = true | 'NULLABLE';

export type Nullable = IsNotNull | IsNullable;

export function isNullable(nullable: Nullable): boolean {
	if (nullable == 'NULLABLE') return true;
	if (nullable == 'NOT NULL') return false;
	return !!nullable;
}