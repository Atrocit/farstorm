import { describe, expect, it } from 'vitest';
import { Farstorm, defineEntity, defineIdField, sql } from '../../src/main.js';

describe('Postgres: null relation IDs', () => {
	async function setup() {
		const db = new Farstorm({
			type: 'postgresql',
			host: process.env['DB_HOST'] ?? 'localhost',
			port: Number(process.env['DB_PORT'] ?? '5432'),
			username: process.env['DB_USERNAME'] ?? '',
			password: process.env['DB_PASSWORD'] ?? '',
			database: process.env['DB_NAME'] ?? '',
			appName: 'farstormTests',
			ssl: false,
			poolSize: 2,
		}, {
			Subject: defineEntity({
				fields: { id: defineIdField() },
				oneToOneOwned: {
					profile: { entity: 'Profile', nullable: true },
				},
				manyToOne: {
					owner: { entity: 'Owner', nullable: true },
				},
				oneToOneInverse: {
					inverseProfile: { entity: 'InverseProfile', inverse: 'subject', nullable: true },
				},
				oneToMany: {
					children: { entity: 'Child', inverse: 'subject' },
				},
			}),
			Profile: defineEntity({
				fields: { id: defineIdField() },
			}),
			Owner: defineEntity({
				fields: { id: defineIdField() },
			}),
			InverseProfile: defineEntity({
				fields: { id: defineIdField() },
				oneToOneOwned: {
					subject: { entity: 'Subject', nullable: false },
				},
			}),
			Child: defineEntity({
				fields: { id: defineIdField() },
				manyToOne: {
					subject: { entity: 'Subject', nullable: false },
				},
			}),
		});

		await db.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`drop table if exists "child", "inverse_profile", "subject", "owner", "profile" cascade`);
			await nativeQuery(sql`create table "profile" (id bigint primary key)`);
			await nativeQuery(sql`create table "owner" (id bigint primary key)`);
			await nativeQuery(sql`create table "subject" (id bigint, profile_id bigint, owner_id bigint)`);
			await nativeQuery(sql`create table "inverse_profile" (id bigint primary key, subject_id bigint)`);
			await nativeQuery(sql`create table "child" (id bigint primary key, subject_id bigint)`);
			await nativeQuery(sql`insert into "profile" (id) values (2)`);
			await nativeQuery(sql`insert into "owner" (id) values (3)`);
			await nativeQuery(sql`insert into "subject" (id, profile_id, owner_id) values (1, 2, 3), (null, null, null)`);
		});

		return {
			db,
			cleanup: () => db.inTransaction(async ({ nativeQuery }) => {
				await nativeQuery(sql`drop table if exists "child", "inverse_profile", "subject", "owner", "profile" cascade`);
			}),
		};
	}

	it('does not query nullable owned relations after their foreign keys become null', async () => {
		const { db, cleanup } = await setup();

		try {
			await db.inTransaction(async ({ findOne, saveOne, transactionStatistics }) => {
				const subject = await findOne('Subject', '1');

				await saveOne('Subject', { id: subject.id, profile: null, owner: null });

				expect(await subject.profile).toBeNull();
				expect(await subject.owner).toBeNull();
				expect(transactionStatistics.queries).toHaveLength(2);
			});
		} finally {
			await cleanup();
		}
	});

	it('does not query inverse relations for an entity with a null ID', async () => {
		const { db, cleanup } = await setup();

		try {
			await db.inTransaction(async ({ findMany, transactionStatistics }) => {
				const [ subject ] = await findMany('Subject', { where: sql`id is null` });

				expect(subject.id).toBeNull();
				expect(await subject.inverseProfile).toBeNull();
				expect(await subject.children).toEqual([]);
				expect(transactionStatistics.queries).toHaveLength(1);
			});
		} finally {
			await cleanup();
		}
	});
});
