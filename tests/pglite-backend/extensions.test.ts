import { describe, it } from "vitest";
import { Farstorm, sql } from "../../src/main";

describe('PGLite: extensions', () => {
	async function setup() {
		const db = new Farstorm({
			type: 'pglite',
		}, {});

		return {
			db,
			cleanup: async () => {
				await db.inTransaction(async ({ nativeQuery }) => {
					await nativeQuery(sql`rollback;`);
				});
			},
		};
	}

	it('creating extension pg_trgm should work', async ({ expect }) => {
		const { db, cleanup } = await setup();
		try {
			await db.inTransaction(async ({ nativeQuery }) => {
				await nativeQuery(sql`create extension if not exists pg_trgm;`);
			});
		} catch (e) {
			expect.fail('Should not throw exception');
		}
		await cleanup();
	});
});