import type { IDBPDatabase } from 'idb';
import { deleteDB, openDB } from 'idb';
import type {
	DatabaseAsync,
	DeleteDB,
	GetResult,
	OpenDB,
	StoreAsync,
	StoreOperations,
	StoreValue,
} from '@/interface';

const META_STORE = '__uni-kv-meta__';

class IndexedDBStore<T> implements StoreAsync<T> {
	constructor(
		private readonly getDatabase: () => Promise<IDBPDatabase>,
		private readonly storeName: string,
	) {}

	async get(key: string): Promise<T | undefined> {
		return (await (await this.getDatabase()).get(this.storeName, key)) as T | undefined;
	}

	async set(key: string, value: T): Promise<void> {
		await (await this.getDatabase()).put(this.storeName, value, key);
	}

	async delete(key: string): Promise<void> {
		await (await this.getDatabase()).delete(this.storeName, key);
	}

	async clear(): Promise<void> {
		await (await this.getDatabase()).clear(this.storeName);
	}

	async keys(): Promise<Array<string>> {
		return (await (await this.getDatabase()).getAllKeys(this.storeName)).map((key) => {
			if (typeof key !== 'string') throw new TypeError('IndexedDB store key is not a string');
			return key;
		});
	}

	async values(): Promise<Array<T>> {
		return (await (await this.getDatabase()).getAll(this.storeName)) as Array<T>;
	}

	async entries(): Promise<Array<[string, T]>> {
		return (await this.batch((await this.keys()).map((key) => ({ key, type: 'get' })))).map(
			({ key, value }) => [key, value as T],
		);
	}

	async batch(operations: Array<StoreOperations<T>>): Promise<Array<GetResult<T>>> {
		if (!operations.length) return [];
		const database = await this.getDatabase();
		const isReadonly = operations.every((op) => op.type === 'get');
		const tx = database.transaction(this.storeName, isReadonly ? 'readonly' : 'readwrite');
		const store = tx.objectStore(this.storeName);

		const results = await Promise.all(
			operations.map(async (op) => {
				if (op.type === 'get')
					return { key: op.key, value: (await store.get(op.key)) as T | undefined };
				if (op.type === 'set') await store.put!(op.value, op.key);
				else if (op.type === 'delete') await store.delete!(op.key);
			}),
		);

		await tx.done;
		return results.filter((r): r is GetResult<T> => r !== undefined);
	}
}

class IndexedDBDatabase<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
> implements DatabaseAsync<D, M> {
	private idb: Promise<IDBPDatabase>;
	private upgradeLock?: Promise<void>;

	constructor(public readonly name: string) {
		this.idb = openDB(this.name);
	}

	private async hasStore(name: string) {
		return (await this.idb).objectStoreNames.contains(name);
	}

	private async reopenWithUpgrade(upgrade: (db: IDBPDatabase) => void): Promise<void> {
		if (this.upgradeLock) await this.upgradeLock;
		let resolve!: () => void;
		this.upgradeLock = new Promise((resolver) => (resolve = resolver));
		const database = await this.idb;
		database.close();
		this.idb = openDB(this.name, database.version + 1, { upgrade });
		resolve();
		this.upgradeLock = undefined;
	}

	private async ensureStore(store: string): Promise<void> {
		if (await this.hasStore(store)) return;
		await this.reopenWithUpgrade((db) => {
			if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
		});
	}

	private assertNotMetaStore(name: string): void {
		if (name === META_STORE) throw new Error('Cannot access internal meta store');
	}

	async getStore<T = undefined, K extends keyof D = ''>(
		name: T extends undefined ? K : string,
	): Promise<IndexedDBStore<StoreValue<D, K, T>>> {
		const storeName = String(name);
		this.assertNotMetaStore(storeName);
		await this.ensureStore(storeName);
		return new IndexedDBStore<StoreValue<D, K, T>>(() => this.idb, storeName);
	}

	async getStoreNames(): Promise<Array<string>> {
		const database = await this.idb;
		return [...database.objectStoreNames].filter((n) => n !== META_STORE);
	}

	async deleteStore(name: string): Promise<void> {
		this.assertNotMetaStore(name);
		if (!(await this.hasStore(name))) return;
		await this.reopenWithUpgrade((db) => {
			if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
		});
	}

	async clearStores(): Promise<void> {
		const database = await this.idb;
		const names = [...database.objectStoreNames].filter((n) => n !== META_STORE);
		if (!names.length) return;
		await this.reopenWithUpgrade((db) => {
			const newNames = [...database.objectStoreNames].filter((n) => n !== META_STORE);
			for (const n of newNames) db.deleteObjectStore(n);
		});
	}

	async getMeta<T extends keyof M>(key: T): Promise<M[T] | undefined> {
		await this.ensureStore(META_STORE);
		return (await (await this.idb).get(META_STORE, String(key))) as M[T] | undefined;
	}

	async setMeta<T extends keyof M>(key: T, value: M[T]): Promise<void> {
		await this.ensureStore(META_STORE);
		await (await this.idb).put(META_STORE, value, String(key));
	}

	async dispose() {
		(await this.idb).close();
	}
}

export const openIndexedDB = (<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
>(
	name: string,
) => new IndexedDBDatabase<D, M>(name)) as OpenDB<true>;

export const deleteIndexedDB: DeleteDB<true> = (name: string) => deleteDB(name);
