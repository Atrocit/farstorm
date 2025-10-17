import { describe, expectTypeOf, it } from "vitest";
import { defineEntity, defineField, defineIdField, Farstorm, OutputType } from "../../src/main";

describe('Types: circular references', () => {
	const entityDefinitions = {
		'EntityA': defineEntity({
			fields: {
				id: defineIdField(),
				name: defineField('string', false),
				a1: defineField('string', false),
				a2: defineField('string', false),
				a3: defineField('string', false),
				a4: defineField('string', false),
				a5: defineField('string', false),
				a6: defineField('string', false),
				a7: defineField('string', false),
				a8: defineField('string', false),
				a9: defineField('string', false),
				a10: defineField('string', false),
				a11: defineField('string', false),
				a12: defineField('string', false),
				a13: defineField('string', false),
				a14: defineField('string', false),
				a15: defineField('string', false),
				a16: defineField('string', false),
				a17: defineField('string', false),
				a18: defineField('string', false),
				a19: defineField('string', false),
			},
			oneToMany: {
				b: { entity: 'EntityB', inverse: 'a' },
				bOther: { entity: 'EntityB', inverse: 'anotherA' },
			},
		}),
		'EntityB': defineEntity({
			fields: {
				id: defineIdField(),
				name: defineField('string', false),
				b1: defineField('string', false),
				b2: defineField('string', false),
				b3: defineField('string', false),
				b4: defineField('string', false),
				b5: defineField('string', false),
				b6: defineField('string', false),
				b7: defineField('string', false),
				b8: defineField('string', false),
				b9: defineField('string', false),
				b10: defineField('string', false),
				b11: defineField('string', false),
				b12: defineField('string', false),
				b13: defineField('string', false),
				b14: defineField('string', false),
				b15: defineField('string', false),
				b16: defineField('string', false),
				b17: defineField('string', false),
				b18: defineField('string', false),
				b19: defineField('string', false),
			},
			manyToOne: {
				a: { entity: 'EntityA', nullable: false },
				anotherA: { entity: 'EntityA', nullable: true },
			},
		}),
	};
	
	it('should still keep types even if recursing deeply', async () => {
		type OrmOutput<N extends keyof typeof entityDefinitions> = OutputType<typeof entityDefinitions, typeof entityDefinitions[N]>;
		
		type BaseA = OrmOutput<'EntityA'>;
		type BaseB = OrmOutput<'EntityB'>;
		
		type AtoB1 = Awaited<BaseA['b']>[number];
		type BtoA1 = Awaited<BaseB['a']>;
		
		expectTypeOf<AtoB1>().toEqualTypeOf<BaseB>();
		expectTypeOf<BtoA1>().toEqualTypeOf<BaseA>();
		
		type AtoBOther = Awaited<BaseA['bOther']>[number];
		type BtoAOther = NonNullable<Awaited<BaseB['anotherA']>>;
		
		expectTypeOf<AtoBOther>().toEqualTypeOf<BaseB>();
		expectTypeOf<BtoAOther>().toEqualTypeOf<BaseA>();
		
		type GetB<T extends BaseA> = Awaited<T['b']>[number];
		type GetA<T extends BaseB> = Awaited<T['a']>;
		type DeepChainAtoB = GetB<GetA<GetB<GetA<GetB<GetA<GetB<GetA<GetB<GetA<GetB<GetA<GetB<GetA<GetB<GetA<GetB<BaseA>>>>>>>>>>>>>>>>>;
		expectTypeOf<DeepChainAtoB>().toEqualTypeOf<BaseB>();
	});
});