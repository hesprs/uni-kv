import type {
	DatabaseSync,
	DeleteDB,
	GetResult,
	StoreSync,
	StoreOperations,
	OpenDB,
} from '@/interface';

const memoryDBRegistry = new Map<
	string,
	MemoryDBDatabase<Record<string, unknown>, Record<string, unknown>>
>();

class MemoryDBStore<T> implements StoreSync<T> {
	private readonly map: Map<string, T>;

	constructor(entries?: Iterable<readonly [string, T]>) {
		this.map = new Map(entries);
	}

	get(key: string): T | undefined {
		return this.map.get(key);
	}

	set(key: string, value: T): void {
		this.map.set(key, value);
	}

	delete(key: string): void {
		this.map.delete(key);
	}

	clear(): void {
		this.map.clear();
	}

	keys(): Array<string> {
		return [...this.map.keys()];
	}

	values(): Array<T> {
		return [...this.map.values()];
	}

	entries(): Array<[string, T]> {
		return [...this.map.entries()];
	}

	batch(operations: Array<StoreOperations<T>>): Array<GetResult<T>> {
		const results: Array<GetResult<T>> = [];

		for (const operation of operations)
			switch (operation.type) {
				case 'get': {
					results.push({ key: operation.key, value: this.map.get(operation.key) });
					break;
				}
				case 'set': {
					this.map.set(operation.key, operation.value);
					break;
				}
				case 'delete': {
					this.map.delete(operation.key);
					break;
				}
			}

		return results;
	}
}

class MemoryDBDatabase<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
> implements DatabaseSync<D, M> {
	private readonly stores: Map<string, MemoryDBStore<unknown>>;
	private readonly meta: Record<string, unknown>;

	constructor(readonly name: string) {
		this.stores = new Map();
		this.meta = {};
	}

	getStore<K extends keyof D>(name: K): MemoryDBStore<D[K]> {
		const storeName = String(name);
		const existing = this.stores.get(storeName);

		if (existing !== undefined) return existing as MemoryDBStore<D[K]>;

		const store = new MemoryDBStore<D[K]>();
		this.stores.set(storeName, store);
		return store;
	}

	getStoreNames(): Array<string> {
		return [...this.stores.keys()];
	}

	deleteStore(name: string): void {
		this.stores.delete(name);
	}

	clearStores(): void {
		this.stores.clear();
	}

	getMeta<T extends keyof M>(key: T): M[T] | undefined {
		return this.meta[String(key)] as M[T] | undefined;
	}

	setMeta<T extends keyof M>(key: T, value: M[T]): void {
		this.meta[String(key)] = value;
	}

	dispose(): void {}
}

export const openMemoryDB = (<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
>(
	name: string,
) => {
	const existing = memoryDBRegistry.get(name);
	if (existing !== undefined) return existing as MemoryDBDatabase<D, M>;
	const database = new MemoryDBDatabase<D, M>(name);
	memoryDBRegistry.set(name, database);
	return database;
}) as OpenDB<false>;

export const deleteMemoryDB: DeleteDB<false> = (name: string) => {
	memoryDBRegistry.delete(name);
};
