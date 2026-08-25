import { describe, expect, it } from 'vitest';
import { Farstorm } from '../src/main.js';

describe('Farstorm constructor', () => {
	it('rejects an unsupported connection type', () => {
		expect(() => new Farstorm({ type: 'unsupported' } as never, {})).toThrowError('Unsupported connection type');
	});
});
