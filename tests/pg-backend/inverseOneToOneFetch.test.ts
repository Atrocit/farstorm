import { Farstorm, defineEntity, defineField, defineIdField, sql } from '../../src/main';

describe('Fetching inverse one-to-one relations', () => {
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
			'LoadOrder': defineEntity({
				fields: {
					id: defineIdField(),
					releaseReference: defineField('string', false),
				},
				oneToOneInverse: {
					stowageCellAssignment: { entity: 'StowageCellAssignment', nullable: true, inverse: 'loadOrder' }, // stowage cell spec?
				},
			} as const),
			'StowageCellAssignment': defineEntity({
				fields: {
					id: defineIdField(),
					equipmentIdentifier: defineField('string', true),
					isoCode: defineField('string', true),
				},
				oneToOneOwned: {
					loadOrder: { entity: 'LoadOrder', nullable: true },
				},
				oneToOneInverse: {
					stowageCell: { entity: 'StowageCell', nullable: true, inverse: 'stowageCellAssignment' },
				},
			} as const),
			'StowageCell': defineEntity({
				fields: {
					id: defineIdField(),
					bay: defineField('number', false),
					row: defineField('number', false),
					tier: defineField('number', false),
				},
				manyToOne: {
					stowagePlan: { entity: 'StowagePlan', nullable: true },
				},
				oneToOneOwned: {
					stowageCellAssignment: { entity: 'StowageCellAssignment', nullable: true },
				},
			} as const),
			'StowagePlan': defineEntity({
				fields: {
					id: defineIdField(),
					portUnlo: defineField('string', true),
				},
				oneToMany: {
					cells: { entity: 'StowageCell', inverse: 'stowagePlan' },
				},
			} as const),
		} as const);

		await db!.inTransaction(async ({ nativeQuery }) => {
			await nativeQuery(sql`begin;`);
			await nativeQuery(sql`drop table if exists "load_order", "stowage_cell", "stowage_plan", "stowage_cell_assignment" cascade;`);

			await nativeQuery(sql`create table "stowage_plan" (id bigserial primary key, port_unlo character varying)`);
			await nativeQuery(sql`create table "load_order" (id bigserial primary key, release_reference character varying not null)`);
			await nativeQuery(sql`create table "stowage_cell_assignment" (id bigserial primary key, equipment_identifier character varying not null, iso_code character varying not null, load_order_id bigint references "load_order")`);
			await nativeQuery(sql`create table "stowage_cell" (id bigserial primary key, bay integer not null, row integer not null, tier integer not null, stowage_plan_id bigint references "stowage_plan", stowage_cell_assignment_id bigint references "stowage_cell_assignment")`);
			await nativeQuery(sql`alter table "stowage_cell"
    								add constraint fk_stowage_cell_stowage_cell_assignment
                					foreign key (stowage_cell_assignment_id)
                    				references stowage_cell_assignment (id)
                    				on delete set null`);
			await nativeQuery(sql`alter table "stowage_cell_assignment"
    								add constraint fk_stowage_cell_assignment_load_order
									foreign key (load_order_id)
									references load_order (id)`);
		});

		return {
			db,
			cleanup: async () => {
				await db.inTransaction(async ({ nativeQuery }) => {
					await nativeQuery(sql`drop table if exists "load_order", "stowage_cell", "stowage_plan", "stowage_cell_assignment" cascade;`);
					await nativeQuery(sql`rollback;`);
				});
			},
		};
	}

	it('should fetch the inverse of a one-to-one relation and return null', async () => {
		const { db, cleanup } = await setup();
		const loadOrder = {
			releaseReference: 'REL-1',
		};

		await db.inTransaction(async ({ saveOne }) => {
			const savedLoadOrder = await saveOne('LoadOrder', loadOrder);
			expect(savedLoadOrder.id).not.toBeUndefined();
			expect(savedLoadOrder.id).not.toBeNull();
			expect(savedLoadOrder.releaseReference).toBe('REL-1');
			const stowageCellAssignment = await savedLoadOrder.stowageCellAssignment;
			expect(stowageCellAssignment).toBeNull();
		});
	});

	it('should fetch the inverse of a one-to-one relation and return not null', async () => {
		const { db, cleanup } = await setup();
		const loadOrder = {
			releaseReference: 'REL-1',
		};

		const stowageCellAssignment = {
			equipmentIdentifier: 'XYZU3333330',
			isoCode: '22G1',
		};

		await db.inTransaction(async ({ saveOne }) => {
			const savedLoadOrder = await saveOne('LoadOrder', loadOrder);
			const savedStowageCellAssignment = await saveOne('StowageCellAssignment', { ...stowageCellAssignment, loadOrder: savedLoadOrder });
			expect(savedLoadOrder.id).not.toBeUndefined();
			expect(savedLoadOrder.id).not.toBeNull();
			expect(savedLoadOrder.releaseReference).toBe('REL-1');
			const fetchedStowageCellAssignment = await savedLoadOrder.stowageCellAssignment;
			expect(fetchedStowageCellAssignment).not.toBeNull();
			expect(fetchedStowageCellAssignment).not.toBeUndefined();
			expect(fetchedStowageCellAssignment?.equipmentIdentifier).toBe('XYZU3333330');
			expect(fetchedStowageCellAssignment?.isoCode).toBe('22G1');
		});
	});

	it('should fetch the inverse of a one-to-one relation that is also the inverse of another one-to-one relation', async () => {
		const { db, cleanup } = await setup();

		const stowagePlan = {
			portUnlo: "BEANR",
		};

		const loadOrder = {
			releaseReference: 'REL-1',
		};

		const stowageCell = {
			bay: 2,
			row: 0,
			tier: 2,
		};

		const stowageCellAssignment = {
			equipmentIdentifier: 'XYZU3333330',
			isoCode: '22G1',
		};

		await db.inTransaction(async ({ saveOne, deleteByIds }) => {
			const savedLoadOrder = await saveOne('LoadOrder', loadOrder);
			const savedStowageCellAssignment = await saveOne('StowageCellAssignment', { ...stowageCellAssignment, loadOrder: savedLoadOrder });
			const savedStowagePlan = await saveOne('StowagePlan', stowagePlan);
			const savedStowageCell = await saveOne('StowageCell', { ...stowageCell, stowageCellAssignment: savedStowageCellAssignment, stowagePlan: savedStowagePlan });

			expect(savedLoadOrder.id).not.toBeUndefined();
			expect(savedLoadOrder.id).not.toBeNull();
			expect(savedLoadOrder.releaseReference).toBe('REL-1');
			const fetchedStowageCellAssignment = await savedLoadOrder.stowageCellAssignment;
			expect(fetchedStowageCellAssignment).not.toBeNull();
			expect(fetchedStowageCellAssignment).not.toBeUndefined();
			expect(fetchedStowageCellAssignment?.equipmentIdentifier).toBe('XYZU3333330');
			expect(fetchedStowageCellAssignment?.isoCode).toBe('22G1');

			if (fetchedStowageCellAssignment == null) throw new Error("Something went wrong or test have failed and allowed this to continue despite that fact.");
			const fetchedStowageCell = await fetchedStowageCellAssignment.stowageCell;
			expect(fetchedStowageCell).not.toBeNull();
			expect(fetchedStowageCell).not.toBeUndefined();
			expect(fetchedStowageCell?.bay).toEqual(2);
			expect(fetchedStowageCell?.row).toEqual(0);
			expect(fetchedStowageCell?.tier).toEqual(2);

			fetchedStowageCellAssignment.loadOrder = null;
			// await deleteByIds('StowageCellAssignment', [ fetchedStowageCellAssignment.id ]);
			await saveOne('StowageCellAssignment', fetchedStowageCellAssignment);

			const newStowageCell = {
				bay: 3,
				row: 0,
				tier: 2,
				stowagePlan: null,
				stowageCellAssignment: null,
			};
			newStowageCell.stowagePlan = savedStowagePlan as any;
			const newStowageCellAssignment = {
				equipmentIdentifier: 'XYZU3333331',
				isoCode: '22G1',
			};

			newStowageCell.stowageCellAssignment = await saveOne('StowageCellAssignment', {
				...newStowageCellAssignment,
				loadOrder: savedLoadOrder,
			}) as any;

			const savedCell = await saveOne('StowageCell', newStowageCell);
			expect(savedCell.id).not.toBeNull();
			expect(savedCell.id).not.toBeUndefined();
			expect(savedCell.bay).toEqual(3);
			expect(savedCell.row).toEqual(0);
			expect(savedCell.tier).toEqual(2);
			const stowageCellAssignmentTwo = await savedLoadOrder.stowageCellAssignment;
			expect(stowageCellAssignmentTwo).not.toBeNull();
			expect(stowageCellAssignmentTwo).not.toBeUndefined();
			expect(stowageCellAssignmentTwo?.equipmentIdentifier).toBe('XYZU3333331');
			expect(stowageCellAssignmentTwo?.isoCode).toBe('22G1');
		});
	});
});