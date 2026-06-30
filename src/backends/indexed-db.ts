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

const openInitializedDatabase = async (name: string, version?: number): Promise<IDBPDatabase> => {
	const db = await openDB(name, version, { upgrade: createMetaStore });
	if (db.objectStoreNames.contains(META_STORE)) return db;
	db.close();
	return openDB(name, db.version + 1, { upgrade: createMetaStore });
};

const createMetaStore = (db: IDBPDatabase): void => {
	if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
};

const createStores = (db: IDBPDatabase, storeNames: Iterable<string>): void => {
	for (const name of storeNames)
		if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
};

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
	private pendingSchemaChange?: Promise<void>;
	private readonly pendingStoreCreations = new Map<
		string,
		{
			promise: Promise<void>;
			resolve: () => void;
			reject: (reason: unknown) => void;
		}
	>();
	private storeCreationFlushScheduled = false;

	constructor(
		public readonly name: string,
		private idb: IDBPDatabase,
	) {}

	private async waitForSchemaChanges(): Promise<void> {
		await this.pendingSchemaChange;
	}

	private async getStableDatabase(): Promise<IDBPDatabase> {
		await this.waitForSchemaChanges();
		return this.idb;
	}

	private async reopenWithUpgrade(upgrade: (db: IDBPDatabase) => void): Promise<void> {
		this.idb.close();
		this.idb = await openDB(this.name, this.idb.version + 1, { upgrade });
	}

	private async runSchemaChange<T>(task: () => Promise<T>): Promise<T> {
		const previous = this.pendingSchemaChange ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => (release = resolve));
		this.pendingSchemaChange = current;
		try {
			await previous;
			return await task();
		} finally {
			release();
			if (this.pendingSchemaChange === current) this.pendingSchemaChange = undefined;
		}
	}

	private async ensureStores(storeNames: Array<string>): Promise<void> {
		const missing = [...new Set(storeNames)].filter(
			(n) => !this.idb.objectStoreNames.contains(n),
		);
		if (!missing.length) return;

		await this.runSchemaChange(async () => {
			const unresolved = missing.filter((n) => !this.idb.objectStoreNames.contains(n));
			if (!unresolved.length) return;
			await this.reopenWithUpgrade((db) => {
				createMetaStore(db);
				createStores(db, unresolved);
			});
		});
	}

	private async ensureMetaStore(): Promise<void> {
		await this.ensureStores([META_STORE]);
	}

	private schedulePendingStoreFlush(): void {
		if (this.storeCreationFlushScheduled) return;
		this.storeCreationFlushScheduled = true;
		queueMicrotask(() => void this.flushPendingStoreCreations());
	}

	private async flushPendingStoreCreations(): Promise<void> {
		this.storeCreationFlushScheduled = false;
		const pending = [...this.pendingStoreCreations.entries()];
		if (!pending.length) return;
		try {
			await this.ensureStores(pending.map(([n]) => n));
			for (const [n, entry] of pending)
				if (this.pendingStoreCreations.get(n) === entry) {
					this.pendingStoreCreations.delete(n);
					entry.resolve();
				}
		} catch (error) {
			for (const [n, entry] of pending)
				if (this.pendingStoreCreations.get(n) === entry) {
					this.pendingStoreCreations.delete(n);
					entry.reject(error);
				}
		}
	}

	private async ensureStore(name: string): Promise<void> {
		await this.waitForSchemaChanges();
		if (this.idb.objectStoreNames.contains(name)) return;
		const pending = this.pendingStoreCreations.get(name);
		if (pending) return await pending.promise;

		let resolve!: () => void;
		let reject!: (reason: unknown) => void;
		const promise = new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		this.pendingStoreCreations.set(name, { promise, reject, resolve });
		this.schedulePendingStoreFlush();
		await promise;
	}

	private assertNotMetaStore(name: string): void {
		if (name === META_STORE) throw new Error('Cannot access internal meta store');
	}

	dispose(): void {
		this.idb.close();
	}

	async getStore<T = undefined, K extends keyof D = ''>(
		name: T extends undefined ? K : string,
	): Promise<IndexedDBStore<StoreValue<D, K, T>>> {
		const storeName = String(name);
		this.assertNotMetaStore(storeName);
		await this.ensureStore(storeName);
		return new IndexedDBStore<StoreValue<D, K, T>>(() => this.getStableDatabase(), storeName);
	}

	async getStoreNames(): Promise<Array<string>> {
		await this.waitForSchemaChanges();
		return [...this.idb.objectStoreNames].filter((n) => n !== META_STORE);
	}

	async deleteStore(name: string): Promise<void> {
		this.assertNotMetaStore(name);
		await this.runSchemaChange(async () => {
			if (!this.idb.objectStoreNames.contains(name)) return;
			await this.reopenWithUpgrade((db) => {
				if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
				createMetaStore(db);
			});
		});
	}

	async clearStores(): Promise<void> {
		await this.runSchemaChange(async () => {
			const names = [...this.idb.objectStoreNames].filter((n) => n !== META_STORE);
			if (!names.length) {
				if (!this.idb.objectStoreNames.contains(META_STORE))
					await this.reopenWithUpgrade(createMetaStore);
				return;
			}
			await this.reopenWithUpgrade((db) => {
				for (const n of names) if (db.objectStoreNames.contains(n)) db.deleteObjectStore(n);
				createMetaStore(db);
			});
		});
	}

	async getMeta<T extends keyof M>(key: T): Promise<M[T] | undefined> {
		await this.ensureMetaStore();
		return (await (await this.getStableDatabase()).get(META_STORE, String(key))) as
			| M[T]
			| undefined;
	}

	async setMeta<T extends keyof M>(key: T, value: M[T]): Promise<void> {
		await this.ensureMetaStore();
		await (await this.getStableDatabase()).put(META_STORE, value, String(key));
	}
}

export const openIndexedDB = (async <
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
>(
	name: string,
) => new IndexedDBDatabase<D, M>(name, await openInitializedDatabase(name))) as OpenDB<true>;

export const deleteIndexedDB: DeleteDB<true> = async (name: string) => deleteDB(name);
