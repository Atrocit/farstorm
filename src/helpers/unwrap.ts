// type PromisedPathInto<T extends Record<string, any>> =
// 	keyof { [K in keyof T as T[K] extends Promise<any> ? K | `${K & string}.${PromisedPathInto<Awaited<T[K]>> & string}` : never]: T[K] }
// 	| keyof { [K in keyof T as T[K] extends Array<any> ? PromisedPathInto<T[K][number]> : never]: T[K] }
// 	| keyof { [K in keyof T as T[K] extends Record<string, any> ? PromisedPathInto<T[K]> : never]: T[K] };

type Unwrapped<T extends Record<string, any>, P extends string> = {
	-readonly [K in keyof T as [ P, T[K] ] extends [ `${K & string}${string}`, Promise<Array<any>> ] ? K : never]:
	// eslint-disable-next-line @stylistic/indent
		P extends `${K & string}.${infer Path}` ? Unwrapped<Awaited<T[K]>[number], Path>[] : Awaited<T[K][number]>[]
} & {
	-readonly [K in keyof T as [ P, T[K] ] extends [ `${K & string}${string}`, Promise<any> ] ? K : never]:
	// eslint-disable-next-line @stylistic/indent
		(P extends `${K & string}.${infer SubPath}` ? Unwrapped<Awaited<T[K]>, SubPath> : Awaited<T[K]>)
} & {
	-readonly [K in keyof T as P extends `${K & string}${string}` ? never : K]: T[K]
};

export async function unwrap<const T extends Record<string, any>, const P extends string>(input: T, paths: P[]): Promise<Unwrapped<T, P>> {
	const pathPartsToResolve = paths.map(path => (path as string).split('.')[0]).filter(p => p.length >= 1);
	const keysToCopy = Object.keys(input).filter(key => !paths.includes(key as P));
	const keysToResolve = Object.keys(input).filter(key => pathPartsToResolve.includes(key));

	const output = {} as any;
	for (const key of keysToCopy) {
		output[key] = input[key];
	}

	const promises = Object.fromEntries(await Promise.all(
		keysToResolve
			.map(key => [ key, input[key] ] as const)
			.map(async ([ key, value ]) => {
				const remainingPaths = (paths as string[]).filter(p => p.indexOf(key) == 0).map(p => p.slice(key.length + 1));
				const awaitedValue = await value;
				if (Array.isArray(awaitedValue)) {
					// @ts-ignore
					return [ key, await Promise.all(awaitedValue.map(async (v, i) => unwrap(v, remainingPaths))) ];
				} else if (typeof awaitedValue == 'object' && awaitedValue !== null) {
					return [ key, await unwrap(awaitedValue, remainingPaths) ];
				} else {
					return [ key, await value ];
				}
			}),
	));

	return { ...output, ...promises };
}

export async function unwrapAll<const T extends Record<string, any>, const P extends string>(input: T[], paths: P[]) {
	return Promise.all(input.map(async i => unwrap(i, paths)));
}