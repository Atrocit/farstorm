export class ChangeTracker<EntityName extends string | number | symbol> {
	inserted: Partial<Record<EntityName, Set<string>>> = {};
	updated: Partial<Record<EntityName, Set<string>>> = {};
	deleted: Partial<Record<EntityName, Set<string>>> = {};

	addInsertedEntities(entityName: EntityName, ids: string[]) {
		if (this.inserted[entityName] == null) this.inserted[entityName] = new Set();
		ids.forEach(id => this.inserted[entityName]!.add(id));
	}

	addUpdatedEntities(entityName: EntityName, ids: string[]) {
		if (this.updated[entityName] == null) this.updated[entityName] = new Set();
		ids.forEach(id => this.updated[entityName]!.add(id));
	}

	addDeletedEntities(entityName: EntityName, ids: string[]) {
		if (this.deleted[entityName] == null) this.deleted[entityName] = new Set();
		ids.forEach(id => this.deleted[entityName]!.add(id));
	}
}