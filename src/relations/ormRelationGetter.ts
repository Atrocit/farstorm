// Magic getter constant
// This is used on custom property getters to mark them as ORM relation getters
export const ormRelationGetter = Symbol('ormRelationGetter');

export function isOrmRelationGetter(object: any, property: string) {
	const getter = Object.getOwnPropertyDescriptor(object, property)?.get;
	if (getter == null) return false;
	return ormRelationGetter in getter && getter[ormRelationGetter] != null && getter[ormRelationGetter] == true;
}