import { describe, it, test, expect } from 'vitest';
import { Farstorm, defineCustomField, defineEntity, defineField, defineIdField, sql } from '../../src/main';

export type ContainerFillStatus = 'EMPTY' | 'FULL';
describe('Saving an entity wth a relation to an already saved one', () => {
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
			'Acceptance': defineEntity({
				fields: {
					id: defineIdField(),
					equipmentIsoCode: defineField('string', true),
					equipmentIdentifier: defineField('string', true),
					equipmentFillStatus: defineCustomField(false, (x: string) => x as ContainerFillStatus, (x: ContainerFillStatus) => x),
					equipmentAmount: defineField('number', false),
					goodsDescription: defineField('string', true),
					reference: defineField('string', false),
					earliestDropoff: defineField('Date', true),
					latestDropoff: defineField('Date', true),
					specialInstructions: defineField('string', true),
					cuckooEndpoint: defineField('string', true),
					createdAt: defineField('Date', false),
					updatedAt: defineField('Date', false),
				},
				oneToMany: {
					// gateIns: { entity: 'GateIn', inverse: 'acceptance' },
				},
				manyToOne: {
					// relation: { entity: 'Relation', nullable: true },
				},
			} as const),
		} as const);

		await db!.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`begin;`);
			await nativeQuery(sql`drop table if exists "acceptance", "gate_in", "relation" cascade;`);

			await nativeQuery(sql`create table "relation" (id bigserial primary key)`);
			await nativeQuery(sql`create table "acceptance" (id bigserial primary key, reference character varying not null, equipment_amount bigint, equipment_iso_code character varying, equipment_identifier character varying, equipment_fill_status character varying not null, goods_description character varying, earliest_dropoff timestamp with time zone, latest_dropoff timestamp with time zone, special_instructions character varying, cuckoo_endpoint character varying, created_at timestamp with time zone not null, updated_at timestamp with time zone not null, relation_id bigint references "relation")`);
			await nativeQuery(sql`create table "gate_in" (id bigserial primary key, acceptance_id bigint references "acceptance")`);
		});

		return {
			db,
			cleanup: async () => {
				await db.inTransaction(async ({ nativeQuery }) => {
					await nativeQuery(sql`drop table if exists "acceptance", "relation", "gate_in" cascade;`);
					await nativeQuery(sql`rollback;`);
				});
			},
		};
	}

	it('should save an entity with a relation to an already saved one', async () => {
		const { db, cleanup } = await setup();
		const acceptance = {
			reference: 'ACC-1',
			equipmentAmount: 3,
			equipmentIsoCode: null,
			equipmentIdentifier: 'ABCU1234560',
			equipmentFillStatus: 'EMPTY' as ContainerFillStatus,
			goodsDescription: null,
			earliestDropoff: new Date('2024-01-01T00:00:00Z'),
			latestDropoff: new Date('2025-01-01T00:00:00Z'),
			specialInstructions: null,
			cuckooEndpoint: null,
			createdAt: new Date('2024-01-01T00:00:00Z'),
			updatedAt: new Date('2024-01-01T00:00:00Z'),
		};

		await db.inTransaction(async ({ saveOne, nativeQuery, findMany }) => {
			let savedAcceptance = await saveOne('Acceptance', acceptance);
			expect(savedAcceptance.id).not.toBeUndefined();
			expect(savedAcceptance.id).not.toBeNull();
			expect(savedAcceptance.reference).toBe('ACC-1');
			expect(savedAcceptance.equipmentAmount).toBe(3);
			// expect(savedAcceptance.eq).toBe(3);
			expect(savedAcceptance.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'));
		});
	});

	it('should allow partial types for fields that are allowed to be null/undefined', async () => {
		const { db, cleanup } = await setup();
		const acceptance = {
			reference: 'ACC-1',
			equipmentAmount: 3,
			equipmentIsoCode: '22G1',
			equipmentIdentifier: 'ABCU1234560',
			equipmentFillStatus: 'EMPTY' as ContainerFillStatus,
			earliestDropoff: new Date('2024-01-01T00:00:00Z'),
			latestDropoff: new Date('2025-01-01T00:00:00Z'),
			createdAt: new Date('2024-01-01T00:00:00Z'),
			updatedAt: new Date('2024-01-01T00:00:00Z'),
		};

		await db.inTransaction(async ({ saveOne, nativeQuery, findMany }) => {
			let savedAcceptance = await saveOne('Acceptance', acceptance);
			expect(savedAcceptance.id).not.toBeUndefined();
			expect(savedAcceptance.id).not.toBeNull();
			expect(savedAcceptance.reference).toBe('ACC-1');
			expect(savedAcceptance.equipmentAmount).toBe(3);
			// expect(savedAcceptance.eq).toBe(3);
			expect(savedAcceptance.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'));
		});
	});
});
