export type RelationTarget = { entity: string, id: string };

/**
 * The promise a relation getter hands out. It does not start fetching until somebody consumes it (await, then, catch, finally).
 *
 * Merely reading a relation property should not hit the database: `{ ...entity }`, Object.assign(), Object.values() and friends
 *  read every enumerable property and turn the result into a plain data property, there is no way to make them copy our getter.
 * By deferring the fetch to the first then() call, those copies carry around a relation that is still unfetched.
 *
 * For owning relations the target is known without fetching anything (it is the foreign key we already have),
 *  which allows saving such a copy without ever resolving the relation.
 */
export class LazyRelationPromise<T> extends Promise<T> {
	readonly #load: () => Promise<T>;
	readonly #settle: (value: Promise<T>) => void;
	readonly #target: RelationTarget | null;
	#loading: Promise<T> | null = null;

	constructor(load: () => Promise<T>, target: RelationTarget | null = null) {
		let settle!: (value: Promise<T>) => void;
		super(resolve => { settle = resolve; });
		this.#load = load;
		this.#settle = settle;
		this.#target = target;
	}

	// Promises derived from this one (through finally() for example) should be plain promises, not lazy ones
	static override get [Symbol.species]() {
		return Promise;
	}

	// catch() and finally() are defined in terms of then(), as is await, so this is the single place where consumption starts
	override then<Fulfilled = T, Rejected = never>(
		onFulfilled?: ((value: T) => Fulfilled | PromiseLike<Fulfilled>) | null,
		onRejected?: ((reason: any) => Rejected | PromiseLike<Rejected>) | null,
	): Promise<Fulfilled | Rejected> {
		if (this.#loading == null) {
			this.#loading = this.#load();

			// Mirror the outcome onto the underlying promise, so inspecting it in a debugger or log shows the real state
			// Rejections are reported through the promise we return below, the mirror should not report them a second time
			this.#settle(this.#loading);
			super.then(undefined, () => {});
		}
		return this.#loading.then(onFulfilled, onRejected);
	}

	/**
	 * Gives the entity an owning relation points to if the value is a relation promise handed out by the ORM, null otherwise
	 */
	static targetOf(value: unknown): RelationTarget | null {
		if (typeof value != 'object' || value == null || !(#target in value)) return null;
		return value.#target;
	}
}
