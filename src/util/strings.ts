export type SnakeToCamelCase<S extends string> = S extends `${infer T}_${infer U}` ? `${T}${Capitalize<SnakeToCamelCase<U>>}` : S;
export type CamelToSnakeCase<S extends string> = S extends `${infer T}${infer U}` ? `${T extends Capitalize<T> ? "_" : ""}${Lowercase<T>}${CamelToSnakeCase<U>}` : S;
export type IdSuffixed<S extends string> = `${S}_id`;

export function snakeCaseToCamelCase<I extends string>(input: I): SnakeToCamelCase<I> {
	return input.replace(/(_\w)/g, (match) => match[1].toUpperCase()) as SnakeToCamelCase<I>;
}

export function suffixId<I extends string>(input: I): IdSuffixed<I> {
	return `${input}_id`;
}

/**
 * This function converts a camelCase string to snake_case.
 * I know the implementation looks kind of ridiculous, but the performance of this is pretty critical
 *  as this function is called in inner loops a lot.
 * This is the best performing version I could come up with using JSBench.me for now
 * @param str
 */
export function camelCaseToSnakeCase<I extends string>(str: I): CamelToSnakeCase<I> {
	let result = '';
	const length = str.length;

	for (let i = 0; i < length; i++) {
		const charCode = str.charCodeAt(i);

		if (charCode >= 65 && charCode <= 90) { // 'A' to 'Z'
			if (i > 0) result += '_';
			result += String.fromCharCode(charCode + 32); // Convert to lowercase
		} else {
			result += str[i];
		}
	}

	return result as CamelToSnakeCase<I>;
}