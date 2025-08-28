/**
 * Can be used to check at compile time that the inferred type is actually matching with what the developer expects.
 * Typical use might be to check using type narrowing that all cases of a discriminated union are handled by writing
 *  an expectType<never, typeof discriminatedUnion>(); function call. Adding a case will make that line error.
 */
export function expectType<Expected, Value extends Expected>() {}