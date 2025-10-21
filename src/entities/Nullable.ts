export type LegacyNullable = boolean;
export type Nullable = 'NULLABLE' | 'NOT NULL' | LegacyNullable;

export function isNullable(nullable: Nullable) {
	if (nullable == 'NULLABLE') return true;
	if (nullable == 'NOT NULL') return false;
	return !!nullable;
}