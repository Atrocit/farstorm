import { isOrmRelationGetter } from '../src/relations/ormRelationGetter';

export function hideRelations<T>(input: T): T {
	const output = {} as T;
	for (const key in input) {
		if (!isOrmRelationGetter(input, key)) {
			output[key] = input[key];
		}
	}
	return output;
}