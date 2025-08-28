export class RelationCache<EntityName extends string | number | symbol, RelationName extends string | number | symbol, Contents> {
	private cache: Partial<Record<EntityName, Partial<Record<RelationName, Promise<Contents>>>>> = {};

	find(entityName: EntityName, relationName: RelationName) {
		const forEntity = this.cache[entityName];
		if (forEntity == null) return null;
		return forEntity[relationName] ?? null;
	}

	overwrite(entityName: EntityName, relationName: RelationName, contents: Promise<Contents>) {
		if (this.cache[entityName] == null) this.cache[entityName] = {};

		// @ts-ignore
		this.cache[entityName][relationName] = contents;
	}

	invalidateForEntity(entity: EntityName) {
		delete this.cache[entity];
	}

	invalidateByCondition(shouldInvalidateFunction: (entityName: EntityName, relationName: RelationName) => boolean) {
		for (const [ entityName, entityRelations ] of Object.entries(this.cache)) {
			for (const relationName of Object.keys(entityRelations as any)) {
				if (shouldInvalidateFunction(entityName as EntityName, relationName as RelationName)) {
					// @ts-ignore
					this.cache[entityName][relationName] = null;
				}
			}
		}
	}

	async waitForAllResolved() {
		const promises: Promise<any>[] = [];
		for (const relationRecord of Object.values(this.cache)) {
			for (const p of Object.values(relationRecord as any)) {
				promises.push(p as Promise<string[]>);
			}
		}
		await Promise.allSettled(promises);
	}

}