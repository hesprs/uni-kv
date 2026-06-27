// oxlint-disable typescript/method-signature-style

type Database<
	D extends Record<string, unknown>,
	M extends Record<string, unknown>,
	F extends boolean,
> = {
	// Return the store if already exist, otherwise create a new one
	// TypeScript trick: if user provided store name is in D, use it. Otherwise user can provide custom T and create stores with arbitrary names
	getStore<T = undefined, K extends keyof D = ''>(
		name: T extends undefined ? K : string,
	): IsPromise<Store<StoreValue<D, K, T>, F>, F>;
	getStoreNames(): IsPromise<Array<string>, F>;
	deleteStore(name: string): IsPromise<void, F>;
	// Delete all stores
	clearStores(): IsPromise<void, F>;
	getMeta<T extends keyof M>(key: T): IsPromise<M[T] | undefined, F>;
	setMeta<T extends keyof M>(key: T, value: M[T]): IsPromise<void, F>;
	dispose(): void;
};

type Store<T, F extends boolean> = {
	get(key: string): IsPromise<T | undefined, F>;
	set(key: string, value: T): IsPromise<void, F>;
	delete(key: string): IsPromise<void, F>;
	// Clear all entries
	clear(): IsPromise<void, F>;
	keys(): IsPromise<Array<string>, F>;
	// Only get operations need returning
	batch(operations: Array<StoreOperations<T>>): IsPromise<Array<GetResult<T>>, F>;
};

export type StoreSync<T> = Store<T, false>;
export type StoreAsync<T> = Store<T, true>;
export type DatabaseSync<
	D extends Record<string, unknown>,
	M extends Record<string, unknown>,
> = Database<D, M, false>;
export type DatabaseAsync<
	D extends Record<string, unknown>,
	M extends Record<string, unknown>,
> = Database<D, M, true>;
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

export type OpenDB<F extends boolean> = <
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
>(
	name: string,
) => IsPromise<Database<D, M, F>, F>;

export type DeleteDB<F extends boolean> = (name: string) => IsPromise<void, F>;

type IsPromise<T, F extends boolean> = F extends true ? Promise<T> : T;
