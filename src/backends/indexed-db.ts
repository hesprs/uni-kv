import type { IDBPDatabase } from 'idb';
import { deleteDB, openDB } from 'idb';
import type {
	DatabaseAsync,
	DeleteDB,
	GetResult,
	OpenDB,
	StoreAsync,
	StoreOperations,
} from '@/interface';

const META_STORE = '__uni-kv-meta__';
const NEEDS_UPGRADE = Symbol('needs-upgrade');

class AccessGate {
	private readers = 0;
	private writer = false;
	private waitingWriters = 0;
	private readonly readWaiters: Array<() => void> = [];
	private readonly writeWaiters: Array<() => void> = [];

	private wake(): void {
		if (this.writer || this.readers > 0) return;
		const writer = this.writeWaiters.shift();
		if (writer) {
			this.writer = true;
			writer();
			return;
		}
		while (this.readWaiters.length > 0 && this.writeWaiters.length === 0) {
			this.readers += 1;
			const reader = this.readWaiters.shift();
			if (reader) reader();
		}
	}

	private async acquireShared(): Promise<void> {
		if (!this.writer && this.waitingWriters === 0) {
			this.readers += 1;
			return;
		}
		await new Promise<void>((resolve) => this.readWaiters.push(resolve));
		this.readers += 1;
	}

	private async acquireExclusive(): Promise<void> {
		this.waitingWriters += 1;
		if (!this.writer && this.readers === 0) {
			this.waitingWriters -= 1;
			this.writer = true;
			return;
		}
		await new Promise<void>((resolve) => this.writeWaiters.push(resolve));
		this.waitingWriters -= 1;
		this.writer = true;
	}

	async shared<T>(operation: () => Promise<T>): Promise<T> {
		await this.acquireShared();
		try {
			return await operation();
		} finally {
			this.readers -= 1;
			if (this.readers === 0) this.wake();
		}
	}

	async exclusive<T>(operation: () => Promise<T>): Promise<T> {
		await this.acquireExclusive();
		try {
			return await operation();
		} finally {
			this.writer = false;
			this.wake();
		}
	}

	async downgrade<T>(operation: () => Promise<T>): Promise<T> {
		this.writer = false;
		this.readers += 1;
		this.wake();
		try {
			return await operation();
		} finally {
			this.readers -= 1;
			if (this.readers === 0) this.wake();
		}
	}
}

class IndexedDBStore<T> implements StoreAsync<T> {
	constructor(
		private readonly run: <T>(operation: (db: IDBPDatabase) => Promise<T>) => Promise<T>,
		private readonly storeName: string,
	) {}

	get(key: string): Promise<T | undefined> {
		return this.run((db) => db.get(this.storeName, key));
	}

	async set(key: string, value: T): Promise<void> {
		await this.run((db) => db.put(this.storeName, value, key));
	}

	async delete(key: string): Promise<void> {
		await this.run((db) => db.delete(this.storeName, key));
	}

	async clear(): Promise<void> {
		await this.run((db) => db.clear(this.storeName));
	}

	keys(): Promise<Array<string>> {
		return this.run(async (db) =>
			(await db.getAllKeys(this.storeName)).map((key) => {
				if (typeof key !== 'string')
					throw new TypeError('IndexedDB store key is not a string');
				return key;
			}),
		);
	}

	values(): Promise<Array<T>> {
		return this.run((db) => db.getAll(this.storeName));
	}

	entries(): Promise<Array<[string, T]>> {
		return this.run(async (db) => {
			const tx = db.transaction(this.storeName, 'readonly');
			const store = tx.objectStore(this.storeName);
			const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()]);
			await tx.done;
			return keys.map((key, index) => [key as string, values[index] as T]);
		});
	}

	batch(operations: Array<StoreOperations<T>>): Promise<Array<GetResult<T>>> {
		if (!operations.length) return Promise.resolve([]);
		return this.run(async (db) => {
			const isReadonly = operations.every((op) => op.type === 'get');
			const tx = db.transaction(this.storeName, isReadonly ? 'readonly' : 'readwrite');
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
		});
	}
}

class IndexedDBDatabase<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
> implements DatabaseAsync<D, M> {
	private idb: Promise<IDBPDatabase> | undefined;
	private readonly gate = new AccessGate();

	constructor(public readonly name: string) {}

	private createConnection(
		version?: number,
		upgrade?: (db: IDBPDatabase) => void,
	): Promise<IDBPDatabase> {
		const connection = openDB(this.name, version, {
			blocking: () => {
				if (this.idb === connection) this.idb = undefined;
				void connection?.then(
					(db) => db.close(),
					() => undefined,
				);
			},
			terminated: () => {
				if (this.idb === connection) this.idb = undefined;
			},
			upgrade,
		});
		return connection;
	}

	private async getConnection(): Promise<IDBPDatabase> {
		const connection = this.idb ?? this.createConnection();
		this.idb = connection;
		try {
			return await connection;
		} catch (error) {
			if (this.idb === connection) this.idb = undefined;
			throw error;
		}
	}

	private async openDBUnlocked(
		condition: (db: IDBPDatabase) => unknown,
		upgrade: (db: IDBPDatabase) => void,
	): Promise<IDBPDatabase> {
		while (true) {
			const idb = await this.getConnection();
			if (!condition(idb)) return idb;
			idb.close();
			const connection = this.createConnection(idb.version + 1, upgrade);
			this.idb = connection;
			try {
				const database = await connection;
				if (!condition(database)) return database;
			} catch (error) {
				if (!(error instanceof DOMException) || error.name !== 'VersionError') throw error;
				if (this.idb === connection) this.idb = undefined;
			}
		}
	}

	private async openDB(
		condition: (db: IDBPDatabase) => unknown,
		upgrade: (db: IDBPDatabase) => void,
	): Promise<IDBPDatabase> {
		return this.gate.exclusive(() => this.openDBUnlocked(condition, upgrade));
	}

	private async withStore<T>(
		store: string,
		operation: (db: IDBPDatabase) => Promise<T>,
	): Promise<T> {
		try {
			return await this.gate.shared(async () => {
				const db = await this.getConnection();
				if (!db.objectStoreNames.contains(store)) throw NEEDS_UPGRADE;
				return operation(db);
			});
		} catch (error) {
			if (error !== NEEDS_UPGRADE) throw error;
			return this.gate.exclusive(async () => {
				const database = await this.openDBUnlocked(
					(db) => !db.objectStoreNames.contains(store),
					(db) => db.createObjectStore(store),
				);
				return this.gate.downgrade(() => operation(database));
			});
		}
	}

	private assertNotMetaStore(name: string): void {
		if (name === META_STORE) throw new Error('Cannot access internal meta store');
	}

	getStore<K extends keyof D>(name: K): IndexedDBStore<D[K]> {
		const storeName = String(name);
		this.assertNotMetaStore(storeName);
		return new IndexedDBStore<D[K]>(
			async (operation) => this.withStore(storeName, operation),
			storeName,
		);
	}

	async getStoreNames(): Promise<Array<string>> {
		const database = await this.getConnection();
		return [...database.objectStoreNames].filter((n) => n !== META_STORE);
	}

	async deleteStore(name: string): Promise<void> {
		this.assertNotMetaStore(name);
		if (!(await this.getConnection()).objectStoreNames.contains(name)) return;
		await this.openDB(
			(db) => db.objectStoreNames.contains(name),
			(db) => db.deleteObjectStore(name),
		);
	}

	async clearStores(): Promise<void> {
		const filterNames = (db: IDBPDatabase) =>
			[...db.objectStoreNames].filter((n) => n !== META_STORE);
		const names = filterNames(await this.getConnection());
		if (!names.length) return;
		await this.openDB(
			(db) => filterNames(db).length,
			(db) => {
				for (const n of filterNames(db)) db.deleteObjectStore(n);
			},
		);
	}

	async getMeta<T extends keyof M>(key: T): Promise<M[T] | undefined> {
		return this.withStore(META_STORE, (db) => db.get(META_STORE, String(key))) as Promise<
			M[T] | undefined
		>;
	}

	async setMeta<T extends keyof M>(key: T, value: M[T]): Promise<void> {
		await this.withStore(META_STORE, (db) => db.put(META_STORE, value, String(key)));
	}

	async dispose() {
		await this.gate.exclusive(async () => {
			if (this.idb) (await this.idb).close();
		});
	}
}

export const openIndexedDB = (<
	D extends Record<string, unknown> = Record<string, unknown>,
	M extends Record<string, unknown> = {},
>(
	name: string,
) => new IndexedDBDatabase<D, M>(name)) as OpenDB<true>;

export const deleteIndexedDB: DeleteDB<true> = (name: string) => deleteDB(name);
