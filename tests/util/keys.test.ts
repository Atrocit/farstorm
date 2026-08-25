import { describe, expect, expectTypeOf, it } from 'vitest';
import { strictKeysOfObject } from '../../src/util/keys.js';

describe('strictKeysOfObject', () => {
	it('returns the enumerable string keys of an object', () => {
		const input = { id: 1, name: 'item' };

		expect(strictKeysOfObject(input)).toEqual([ 'id', 'name' ]);
		expectTypeOf(strictKeysOfObject(input)).toEqualTypeOf<('id' | 'name')[]>();
	});
});
