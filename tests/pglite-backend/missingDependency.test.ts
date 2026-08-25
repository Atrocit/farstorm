import { afterEach, describe, expect, it, vi } from 'vitest';

describe('PGLite: missing dependency', () => {
	afterEach(() => {
		vi.doUnmock('../../src/drivers/pglite.js');
		vi.resetModules();
	});

	it('reports how to enable the backend when the optional driver cannot load', async () => {
		vi.resetModules();
		vi.doMock('../../src/drivers/pglite.js', () => {
			throw new Error('module is unavailable');
		});
		const { Farstorm } = await import('../../src/main.js');
		const db = new Farstorm({ type: 'pglite' }, {});

		await expect(db.inTransaction(async () => undefined)).rejects.toThrowError(
			"PgLite driver not available. Install '@electric-sql/pglite' to use the pglite backend.",
		);
	});
});
