// oxlint-disable typescript/consistent-type-definitions
// oxlint-disable typescript/method-signature-style

export interface Database<D extends Record<string, unknown>, M extends Record<string, unknown>> {
	// Return the store if already exist, otherwise create a new one
	// TypeScript trick: if user provided store name is in D, use it. Otherwise user can provide custom T and create stores with arbitrary names
	getStore<T = undefined, K extends keyof D = ''>(
		name: T extends undefined ? K : string,
	): MaybePromise<Store<StoreValue<D, K, T>>>;
	getStoreNames(): MaybePromise<Array<string>>;
	deleteStore(name: string): MaybePromise<void>;
	// Delete all stores
	clearStores(): MaybePromise<void>;
	getMeta<T extends keyof M>(key: T): MaybePromise<M[T] | undefined>;
	setMeta<T extends keyof M>(key: T, value: M[T]): MaybePromise<void>;
}

export interface Store<T> {
	get(key: string): MaybePromise<T | undefined>;
	set(key: string, value: T): MaybePromise<void>;
	delete(key: string): MaybePromise<void>;
	// Clear all entries
	clear(): MaybePromise<void>;
	keys(): MaybePromise<Array<string>>;
	// Only get operations need returning
	batch(operations: Array<StoreOperations<T>>): MaybePromise<Array<GetResult<T>>>;
}

export type GetOperation = { type: 'get'; key: string };
export type GetResult<T> = { key: string; value: T | undefined };
export type SetOperation<T> = { type: 'set'; key: string; value: T };
export type DeleteOperation = { type: 'delete'; key: string };
export type StoreOperations<T> = GetOperation | SetOperation<T> | DeleteOperation;

export type StoreValue<D extends Record<string, unknown>, K extends keyof D, T> = [T] extends [
	undefined,
]
	? D[K]
	: T;

// Public API, create or open existing database, used by `satisfy` only
export type OpenDB = <
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
>(
	name: string,
) => MaybePromise<Database<D, M>>;

// Public API, delete a database if it exists
export type DeleteDB = (name: string) => MaybePromise<void>;

type MaybePromise<T> = T | Promise<T>;
