// This type is an identity type: the output is identical to the input, except it forces the TypeScript compiler to evaluate the type
// Collapsing the type is useful both for performance reasons (it makes TypeScript horribly slow otherwise in some scenarios)
//  and it has the added benefit of making the types much more readable in error messages and IDE inlay hints
// type EvalGeneric<X> = X extends infer C ? { [K in keyof C]: C[K] } : never;
export type EvalGeneric<X> = unknown extends X
	? X
	: (X extends infer C ? { [K in keyof C]: C[K] } : never);