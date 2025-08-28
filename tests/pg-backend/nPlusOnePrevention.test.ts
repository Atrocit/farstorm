import { Farstorm, sql } from '../../src/main.js';
import { defineEntity, defineField, defineIdField } from '../../src/entities/BaseEntity';
import { hideRelations } from '../testHelpers';

describe('Postgres: findMany', () => {
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
			'Call': defineEntity({
				fields: {
					id: defineIdField(),
					reference: defineField('string', false),
					pta: defineField('Date', false),
					ptd: defineField('Date', false),
					remark: defineField('string', true),
					unloadMoves: defineField('number', true),
					loadMoves: defineField('number', true),
					ata: defineField('Date', true),
					atd: defineField('Date', true),
				},
				manyToOne: {
					ship: { entity: 'Ship', nullable: true },
				},
				oneToMany: {
					loadOrders: { entity: 'LoadOrder', inverse: 'call' },
					unloadOrders: { entity: 'UnloadOrder', inverse: 'call' },
				},
			}),
			'Ship': defineEntity({
				fields: {
					id: defineIdField(),
					name: defineField('string', false),
					imoNumber: defineField('string', true),
					mmsi: defineField('string', true),
					eni: defineField('string', true),
					length: defineField('number', true),
					breadth: defineField('number', true),
				},
				oneToMany: {
					calls: { entity: 'Call', inverse: 'ship' },
				},
			}),
			'LoadOrder': defineEntity({
				fields: {
					id: defineIdField(),
					releaseReference: defineField('string', false),
				},
				manyToOne: {
					call: { entity: 'Call', nullable: false },
				},
			}),
			'UnloadOrder': defineEntity({
				fields: {
					id: defineIdField(),
					acceptanceReference: defineField('string', false),
				},
				manyToOne: {
					call: { entity: 'Call', nullable: false },
				},
			}),
		});

		await db!.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`begin;`);
			await nativeQuery(sql`drop table if exists "call", "ship", "load_order", "unload_order" cascade;`);

			await nativeQuery(sql`
				create table "ship" (
                    id bigserial primary key,
					name character varying not null,
					imo_number character varying,
					mmsi character varying,
					eni character varying,
					length numeric,
					breadth numeric
				);

				create table "call" (
					id bigserial primary key,
					reference character varying not null,
					pta timestamptz not null,
					ptd timestamptz not null,
					remark character varying,
					unload_moves integer,
					load_moves integer,
					ata timestamptz,
					atd timestamptz,
					ship_id bigint references "ship"
				);

				create table "load_order" (
					id bigserial primary key,
					release_reference character varying not null,
					call_id bigint not null references "call"
				);

				create table "unload_order" (
					id bigserial primary key,
					acceptance_reference character varying not null,
					call_id bigint not null references "call"
				);

				insert into "ship" (name, imo_number, mmsi, eni, length, breadth) values ('Ship 1', 'IMO1', 'MMSI1', 'ENI1', 100, 20);
				insert into "call" (reference, pta, ptd, ship_id) values ('Call 1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 1);
				insert into "call" (reference, pta, ptd, ship_id) values ('Call 1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 1);
				insert into "call" (reference, pta, ptd, ship_id) values ('Call 1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 1);
				insert into "unload_order" (acceptance_reference, call_id) values ('acceptanceref1', 1);
				insert into "unload_order" (acceptance_reference, call_id) values ('acceptanceref2', 1);
				insert into "unload_order" (acceptance_reference, call_id) values ('acceptanceref3', 1);
				insert into "unload_order" (acceptance_reference, call_id) values ('acceptanceref4', 2);
				insert into "unload_order" (acceptance_reference, call_id) values ('acceptanceref5', 2);
				insert into "load_order" (release_reference, call_id) values ('releaseref1', 1);
				insert into "load_order" (release_reference, call_id) values ('releaseref2', 1);
				insert into "load_order" (release_reference, call_id) values ('releaseref3', 1);
				insert into "load_order" (release_reference, call_id) values ('releaseref4', 2);
				insert into "load_order" (release_reference, call_id) values ('releaseref5', 2);
			`);
		});

		return {
			db,
			cleanup: async () => {
				await db.inTransaction(async ({ nativeQuery }) => {
					await nativeQuery(sql`drop table if exists "call", "ship", "load_order", "unload_order" cascade;`);
					await nativeQuery(sql`rollback;`);
				});
			},
		};
	}

	it('should fetch ship -> call -> loadorders/unloadorders', async () => {
		const { db, cleanup } = await setup();
		await db.inTransaction(async ({ findOne, transactionStatistics }) => {
			const ship = await findOne('Ship', '1');
			const calls = await ship.calls;

			const call = calls.find(c => c.id == '1')!;
			const loadOrders = await call.loadOrders;
			const unloadOrders = await call.unloadOrders;

			const call2 = calls.find(c => c.id == '2')!;
			const loadOrders2 = await call2.loadOrders;
			const unloadOrders2 = await call2.unloadOrders;

			expect(unloadOrders.map(hideRelations)).toContainEqual({ id: '1', acceptanceReference: 'acceptanceref1' });
			expect(unloadOrders.map(hideRelations)).toContainEqual({ id: '2', acceptanceReference: 'acceptanceref2' });
			expect(unloadOrders.map(hideRelations)).toContainEqual({ id: '3', acceptanceReference: 'acceptanceref3' });
			expect(unloadOrders.map(hideRelations)).not.toContainEqual({ id: '4', acceptanceReference: 'acceptanceref4' });
			expect(unloadOrders.map(hideRelations)).not.toContainEqual({ id: '5', acceptanceReference: 'acceptanceref5' });

			expect(loadOrders.map(hideRelations)).toContainEqual({ id: '1', releaseReference: 'releaseref1' });
			expect(loadOrders.map(hideRelations)).toContainEqual({ id: '2', releaseReference: 'releaseref2' });
			expect(loadOrders.map(hideRelations)).toContainEqual({ id: '3', releaseReference: 'releaseref3' });
			expect(loadOrders.map(hideRelations)).not.toContainEqual({ id: '4', releaseReference: 'releaseref4' });
			expect(loadOrders.map(hideRelations)).not.toContainEqual({ id: '5', releaseReference: 'releaseref5' });

			expect(loadOrders2).toHaveLength(2);
			expect(unloadOrders2).toHaveLength(2);

			// All of the above should only generate 4 queries in total, plus the 3 queries used in the setup function
			expect(transactionStatistics.queries.length).toEqual(4);
			return;
		});
		await cleanup();
	});
});