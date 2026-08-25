import { describe, expect, it } from 'vitest';
import { EntityCache } from '../../src/transaction/EntityCache.js';

describe('EntityCache', () => {
	it('returns empty values for null IDs and entity types that are not cached', () => {
		const cache = new EntityCache<'User' | 'Team', { id: string }>();
		cache.save('User', '1', { id: '1' });

		expect(cache.get('User', null)).toBeNull();
		expect(cache.getAllOfType('Team')).toEqual([]);
	});
});
