import type {
	Database,
	DeleteDB,
	GetResult,
	Store,
	StoreOperations,
	StoreValue,
} from '../interface';

const memoryDatabaseRegistry = new Map<
	string,
	MemoryDatabase<Record<string, unknown>, Record<string, unknown>>
>();

export class MemoryStore<T> implements Store<T> {
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

export class MemoryDatabase<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
> implements Database<D, M> {
	private readonly stores: Map<string, MemoryStore<unknown>>;
	private readonly meta: Record<string, unknown>;

	constructor(readonly name: string) {
		this.stores = new Map();
		this.meta = {};
	}

	getStore<T = undefined, K extends keyof D = ''>(
		name: T extends undefined ? K : string,
	): MemoryStore<StoreValue<D, K, T>> {
		const storeName = String(name);
		const existing = this.stores.get(storeName);

		if (existing !== undefined) return existing as MemoryStore<StoreValue<D, K, T>>;

		const store = new MemoryStore<StoreValue<D, K, T>>();
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
}

export const openMemoryDB = <
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
>(
	name: string,
) => {
	const existing = memoryDatabaseRegistry.get(name);

	if (existing !== undefined) return existing as MemoryDatabase<D, M>;

	const database = new MemoryDatabase<D, M>(name);
	memoryDatabaseRegistry.set(
		name,
		database as MemoryDatabase<Record<string, unknown>, Record<string, unknown>>,
	);
	return database;
};

export const deleteMemoryDB = ((name: string) => {
	memoryDatabaseRegistry.delete(name);
}) satisfies DeleteDB;
