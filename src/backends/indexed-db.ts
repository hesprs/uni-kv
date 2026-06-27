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

const schemaLocks = new Map<string, Promise<void>>();

async function withSchemaLock<T>(name: string, task: () => Promise<T>): Promise<T> {
	const previous = schemaLocks.get(name) ?? Promise.resolve();
	let release!: () => void;
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	const next = previous.then(
		() => current,
		() => current,
	);
	schemaLocks.set(name, next);

	try {
		await previous;
		return await task();
	} finally {
		release();
		if (schemaLocks.get(name) === next) schemaLocks.delete(name);
	}
}

const openInitializedDatabase = async (name: string, version?: number): Promise<IDBPDatabase> => {
	let database = await openDB(name, version, {
		upgrade: createMetaStore,
	});

	if (database.objectStoreNames.contains(META_STORE)) return database;

	const nextVersion = database.version + 1;
	database.close();
	database = await openDB(name, nextVersion, {
		upgrade: createMetaStore,
	});

	return database;
};

const createMetaStore = (database: IDBPDatabase): void => {
	if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
};

class IndexedDBStore<T> implements StoreAsync<T> {
	constructor(
		private readonly getDatabase: () => Promise<IDBPDatabase>,
		private readonly storeName: string,
	) {}

	async get(key: string): Promise<T | undefined> {
		const database = await this.getDatabase();
		const value = await database.get(this.storeName, key);
		return value as T | undefined;
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
		const keys = await (await this.getDatabase()).getAllKeys(this.storeName);
		return keys.map((key) => {
			if (typeof key === 'string') return key;

			throw new TypeError('IndexedDB store key is not a string');
		});
	}

	async batch(operations: Array<StoreOperations<T>>): Promise<Array<GetResult<T>>> {
		if (operations.length === 0) return [];
		const database = await this.getDatabase();

		if (operations.every((operation) => operation.type === 'get')) {
			const tx = database.transaction(this.storeName, 'readonly');
			const store = tx.objectStore(this.storeName);
			const results = await Promise.all(
				operations.map(async (operation) => {
					const value = await store.get(operation.key);
					return { key: operation.key, value: value as T | undefined };
				}),
			);

			await tx.done;
			return results;
		}

		const tx = database.transaction(this.storeName, 'readwrite');
		const store = tx.objectStore(this.storeName);
		const results = await Promise.all(
			operations.map(async (operation) => {
				switch (operation.type) {
					case 'get': {
						const value = await store.get(operation.key);
						return { key: operation.key, value: value as T | undefined };
					}
					case 'set': {
						await store.put(operation.value, operation.key);
						return undefined;
					}
					case 'delete': {
						await store.delete(operation.key);
						return undefined;
					}
				}
			}),
		);

		await tx.done;
		return results.filter((result): result is GetResult<T> => result !== undefined);
	}
}

class IndexedDBDatabase<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
> implements DatabaseAsync<D, M> {
	private pendingSchemaChange?: Promise<void>;

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

	private async reopenWithUpgrade(upgrade: (database: IDBPDatabase) => void): Promise<void> {
		const version = this.idb.version + 1;
		this.idb.close();
		this.idb = await openDB(this.name, version, {
			upgrade,
		});
	}

	private async ensureMetaStoreUnlocked(): Promise<void> {
		if (this.idb.objectStoreNames.contains(META_STORE)) return;
		await this.reopenWithUpgrade(createMetaStore);
	}

	private async runSchemaChange<T>(task: () => Promise<T>): Promise<T> {
		const previous = this.pendingSchemaChange ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		const next = previous.then(
			() => current,
			() => current,
		);
		this.pendingSchemaChange = next;

		try {
			await previous;
			return await withSchemaLock(this.name, task);
		} finally {
			release();
			if (this.pendingSchemaChange === next) this.pendingSchemaChange = undefined;
		}
	}

	private async ensureMetaStore(): Promise<void> {
		await this.runSchemaChange(async () => {
			await this.ensureMetaStoreUnlocked();
		});
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

		await this.runSchemaChange(async () => {
			if (this.idb.objectStoreNames.contains(storeName)) return;
			await this.reopenWithUpgrade((database) => {
				createMetaStore(database);
				if (!database.objectStoreNames.contains(storeName))
					database.createObjectStore(storeName);
			});
		});

		return new IndexedDBStore<StoreValue<D, K, T>>(() => this.getStableDatabase(), storeName);
	}

	async getStoreNames(): Promise<Array<string>> {
		await this.waitForSchemaChanges();
		return [...this.idb.objectStoreNames].filter((name) => name !== META_STORE);
	}

	async deleteStore(name: string): Promise<void> {
		this.assertNotMetaStore(name);

		await this.runSchemaChange(async () => {
			if (!this.idb.objectStoreNames.contains(name)) return;

			await this.reopenWithUpgrade((database) => {
				if (database.objectStoreNames.contains(name)) database.deleteObjectStore(name);

				createMetaStore(database);
			});
		});
	}

	async clearStores(): Promise<void> {
		await this.runSchemaChange(async () => {
			const storeNames = [...this.idb.objectStoreNames].filter((name) => name !== META_STORE);

			if (storeNames.length === 0) {
				await this.ensureMetaStoreUnlocked();
				return;
			}

			await this.reopenWithUpgrade((database) => {
				for (const storeName of storeNames)
					if (database.objectStoreNames.contains(storeName))
						database.deleteObjectStore(storeName);

				createMetaStore(database);
			});
		});
	}

	async getMeta<T extends keyof M>(key: T): Promise<M[T] | undefined> {
		await this.ensureMetaStore();
		const value = await (await this.getStableDatabase()).get(META_STORE, String(key));
		return value as M[T] | undefined;
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
) => {
	const database = new IndexedDBDatabase<D, M>(name, await openInitializedDatabase(name));
	return database;
}) as OpenDB<true>;

export const deleteIndexedDB: DeleteDB<true> = async (name: string) => {
	await deleteDB(name);
};
