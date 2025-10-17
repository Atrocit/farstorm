export function strictKeysOfObject<T extends object>(input: T): Array<keyof T> {
	return Object.keys(input) as any;
}