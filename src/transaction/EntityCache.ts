export class EntityCache<EntityName extends string | symbol | number, Type> {
	private cache: Partial<Record<EntityName, Record<string, Type>>> = {};

	save(entityName: EntityName, id: string | number, entity: Type) {
		if (this.cache[entityName] == null) this.cache[entityName] = {};
		const record = this.cache[entityName]!;
		const isNew = record[id.toString()] == null;
		record[id.toString()] = entity;
		return isNew ? 'NEW' : 'UPDATED';
	}

	get(entityName: EntityName, id: string | number | null): Type | null {
		if (id == null) return null;
		return this.cache[entityName]?.[id.toString()] ?? null;
	}

	getAllOfType(entityName: EntityName): Type[] {
		return Object.values(this.cache[entityName] ?? {});
	}

	remove(entityName: EntityName, id: string | number) {
		delete this.cache[entityName]?.[id.toString()];
	}
}