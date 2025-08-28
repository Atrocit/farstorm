import { _isOrmRelationGetter } from '../src/main';

export function hideRelations<T>(input: T): T {
	const output = {} as T;
	for (const key in input) {
		if (!_isOrmRelationGetter(input, key)) {
			output[key] = input[key];
		}
	}
	return output;
}