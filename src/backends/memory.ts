import type {
	DatabaseSync,
	DeleteDB,
	GetResult,
	StoreSync,
	StoreOperations,
	StoreValue,
	OpenDB,
} from '@/interface';

const memoryDBRegistry = new Map<
	string,
	MemoryDBDatabase<Record<string, unknown>, Record<string, unknown>>
>();

class MemoryDBStore<T> implements StoreSync<T> {
	private readonly entries: Map<string, T>;

	constructor(entries?: Iterable<readonly [string, T]>) {
		this.entries = new Map(entries);
	}

	get(key: string): T | undefined {
		return this.entries.get(key);
	}

	set(key: string, value: T): void {
		this.entries.set(key, value);
	}

	delete(key: string): void {
		this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}

	keys(): Array<string> {
		return [...this.entries.keys()];
	}

	values(): Array<T> {
		return [...this.entries.values()];
	}

	batch(operations: Array<StoreOperations<T>>): Array<GetResult<T>> {
		const results: Array<GetResult<T>> = [];

		for (const operation of operations)
			switch (operation.type) {
				case 'get': {
					results.push({ key: operation.key, value: this.entries.get(operation.key) });
					break;
				}
				case 'set': {
					this.entries.set(operation.key, operation.value);
					break;
				}
				case 'delete': {
					this.entries.delete(operation.key);
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

	getStore<T = undefined, K extends keyof D = ''>(
		name: T extends undefined ? K : string,
	): MemoryDBStore<StoreValue<D, K, T>> {
		const storeName = String(name);
		const existing = this.stores.get(storeName);

		if (existing !== undefined) return existing as MemoryDBStore<StoreValue<D, K, T>>;

		const store = new MemoryDBStore<StoreValue<D, K, T>>();
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

	// No need for disposal
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
