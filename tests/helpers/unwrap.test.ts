import { unwrap } from '../../src/helpers/unwrap';

describe('Unwrap helper function', () => {
	it('Should resolve promise at given path', async () => {
		const input = { a: 1, b: Promise.resolve(2) };
		const output: { a: number, b: number } = await unwrap(input, [ 'b' ]);
		expect(output).toEqual({ a: 1, b: 2 });
	});

	it('Should resolve promise at given path, leaving nested objects/promises untouched', async () => {
		const input = { a: 1, b: Promise.resolve({ c: Promise.resolve(1) }) };
		const output: { a: number, b: { c: Promise<number> } } = await unwrap(input, [ 'b' ]);
		expect(output).toEqual({ a: 1, b: { c: Promise.resolve(1) } });
	});

	it('Should resolve promise at given path, multi level deep', async () => {
		const input = { a: 1, b: Promise.resolve({ c: Promise.resolve(1) }) };
		const output: { a: number, b: { c: number } } = await unwrap(input, [ 'b.c' ]);
		expect(output).toEqual({ a: 1, b: { c: 1 } });
	});

	it('Should resolve promise at given path, multi level deep, leaving other nested objects/promises untouched', async () => {
		const input = { a: 1, b: Promise.resolve({ c: Promise.resolve(1), d: Promise.resolve({ e: Promise.resolve(1) }) }) };
		const output: { a: number, b: { c: number, d: Promise<{ e: Promise<number> }>} } = await unwrap(input, [ 'b.c' ]);
		expect(output).toEqual({ a: 1, b: { c: 1, d: Promise.resolve({ e: Promise.resolve(1) }) } });
	});

	it('Should resolve promises at given path, working with arrays', async () => {
		const input = { a: 1, b: Promise.resolve([ { c: Promise.resolve(1) }, { c: Promise.resolve(2) } ]) };
		const output: { a: number, b: { c: number }[] } = await unwrap(input, [ 'b.c' ]);
		expect(output).toEqual({ a: 1, b: [ { c: 1 }, { c: 2 } ] });
	});

	it('Should resolve promises at given path, working with arrays, multi level deep', async () => {
		const input = { a: 1, b: Promise.resolve([ { c: Promise.resolve(1) }, { c: Promise.resolve(2) } ]) };
		const output = await unwrap(input, [ 'b' ]);
		const a = output.a;
		const b = output.b;
		const c = output.b[0].c;
		expect(output).toEqual({ a: 1, b: [ { c: Promise.resolve(1) }, { c: Promise.resolve(2) } ] });
	});
});