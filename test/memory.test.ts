import { expect, test } from 'bun:test';
import { deleteMemoryDB, openMemoryDB } from '@/backends/memory';

const uniqueName = (label: string) =>
	`${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const memoryDB = openMemoryDB('memoryDB-test');

test('openMemoryDB should reuse database instance for same name', () => {
	const name = uniqueName('reuse');
	try {
		const first = openMemoryDB(name);
		const second = openMemoryDB(name);

		expect(second).toBe(first);
	} finally {
		deleteMemoryDB(name);
	}
});

test('MemoryDatabase should create store on first getStore call', () => {
	const name = uniqueName('create-store');
	try {
		const db = openMemoryDB(name);
		expect(db.getStoreNames()).toEqual([]);
		db.getStore('users');
		expect(db.getStoreNames()).toEqual(['users']);
	} finally {
		deleteMemoryDB(name);
	}
});

test('MemoryStore CRUD and keys should work synchronously', () => {
	const store = memoryDB.getStore<string>('test1');

	store.set('b', '2');
	store.set('a', '1');

	expect(store.get('a')).toBe('1');
	expect(store.keys()).toEqual(['b', 'a']);

	store.delete('b');

	expect(store.get('b')).toBeUndefined();
	expect(store.keys()).toEqual(['a']);

	store.clear();

	expect(store.keys()).toEqual([]);
});

test('MemoryStore batch should apply ordered operations and return get results', () => {
	const store = memoryDB.getStore<number>('test2');

	const results = store.batch([
		{ key: 'a', type: 'set', value: 1 },
		{ key: 'a', type: 'get' },
		{ key: 'a', type: 'set', value: 2 },
		{ key: 'a', type: 'get' },
		{ key: 'a', type: 'delete' },
		{ key: 'a', type: 'get' },
		{ key: 'missing', type: 'get' },
	]);

	expect(results).toEqual([
		{ key: 'a', value: 1 },
		{ key: 'a', value: 2 },
		{ key: 'a', value: undefined },
		{ key: 'missing', value: undefined },
	]);
	expect(store.get('a')).toBeUndefined();
});

test('MemoryDatabase meta methods should persist plain object values', () => {
	const name = uniqueName('meta');
	try {
		const db = openMemoryDB<Record<string, unknown>, { version: number; owner: string }>(name);

		db.setMeta('version', 1);
		db.setMeta('owner', 'team');

		expect(db.getMeta('version')).toBe(1);
		expect(db.getMeta('owner')).toBe('team');
	} finally {
		deleteMemoryDB(name);
	}
});

test('MemoryDatabase clearStores and deleteMemoryDB should remove stored state', () => {
	const name = uniqueName('clear-delete');
	try {
		const db = openMemoryDB<Record<string, unknown>, { version: number }>(name);

		db.getStore('users').set('id', '1');
		db.setMeta('version', 1);

		db.clearStores();

		expect(db.getStoreNames()).toEqual([]);
		expect(db.getMeta('version')).toBe(1);

		db.getStore('fresh').set('id', '2');
		expect(db.getStoreNames()).toEqual(['fresh']);

		deleteMemoryDB(name);

		const reopened = openMemoryDB<Record<string, unknown>, { version: number }>(name);

		expect(reopened).not.toBe(db);
		expect(reopened.getStoreNames()).toEqual([]);
		expect(reopened.getMeta('version')).toBeUndefined();
	} finally {
		deleteMemoryDB(name);
	}
});
