import { expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import { deleteIndexedDB, openIndexedDB } from '@/backends/indexed-db';

const open = (name: string) => openIndexedDB<Record<string, string>, { version: number }>(name);
const uniqueName = (label: string) =>
	`${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('openIndexedDB should create reusable database with meta store hidden from getStoreNames', async () => {
	const name = uniqueName('indexed-db-open-meta');
	const db = open(name);

	await db.setMeta('version', 1);
	expect(await db.getStoreNames()).toEqual([]);

	const reopened = open(name);
	expect(await reopened.getMeta('version')).toBe(1);
	expect(await reopened.getStoreNames()).toEqual([]);
});

test('IndexedDBDatabase should coalesce same store creation in same tick', async () => {
	const db = open(uniqueName('indexed-db-coalesce-store'));

	const first = db.getStore('items');
	const second = db.getStore('items');
	await Promise.all([first.set('a', '1'), second.set('b', '2')]);

	expect(await db.getStoreNames()).toEqual(['items']);
	expect(await first.get('b')).toBe('2');
	expect(await second.get('a')).toBe('1');
});

test('IndexedDBDatabase should create concurrent fresh stores safely', async () => {
	const db = open(uniqueName('indexed-db-concurrent-stores'));

	const syncState = db.getStore('sync-state');
	const baseText = db.getStore('base-text');

	expect(await db.getStoreNames()).toEqual([]);
	await Promise.all([syncState.set('sync', '1'), baseText.set('base', '2')]);
	expect((await db.getStoreNames()).sort()).toEqual(['base-text', 'sync-state']);

	expect(await syncState.get('sync')).toBe('1');
	expect(await baseText.get('base')).toBe('2');
});

test('IndexedDBStore wrappers should keep working during later schema upgrades', async () => {
	const db = open(uniqueName('indexed-db-upgrade'));
	const users = db.getStore('users');
	await users.set('a', '1');
	const upgrade = db.getStore('logs').set('a', '1');
	const write = users.set('b', '2');

	await Promise.all([upgrade, write]);

	expect(await users.get('b')).toBe('2');
});

test('IndexedDBStore CRUD and keys should work through idb helpers', async () => {
	const db = open(uniqueName('indexed-db-crud'));
	const store = db.getStore('items');

	await store.set('a', '1');
	await store.set('b', '2');
	expect(await store.get('a')).toBe('1');
	expect(await store.keys()).toEqual(['a', 'b']);

	await store.delete('a');
	expect(await store.get('a')).toBeUndefined();

	await store.clear();
	expect(await store.keys()).toEqual([]);
});

test('IndexedDBStore batch should return ordered get results including missing values', async () => {
	const db = open(uniqueName('indexed-db-batch'));
	const store = db.getStore('items');

	const results = await store.batch([
		{ key: 'a', type: 'set', value: '1' },
		{ key: 'a', type: 'get' },
		{ key: 'missing', type: 'get' },
		{ key: 'a', type: 'delete' },
	]);

	expect(results).toEqual([
		{ key: 'a', value: '1' },
		{ key: 'missing', value: undefined },
	]);
});

test('IndexedDBDatabase meta methods should use dedicated meta store', async () => {
	const db = open(uniqueName('indexed-db-meta'));

	await db.setMeta('version', 7);
	expect(await db.getMeta('version')).toBe(7);
	expect(await db.getStoreNames()).toEqual([]);
});

test('IndexedDBDatabase clearStores should keep database usable', async () => {
	const db = open(uniqueName('indexed-db-clear'));
	const store = db.getStore('items');

	await store.set('a', '1');
	await db.setMeta('version', 1);
	await db.clearStores();

	expect(await db.getStoreNames()).toEqual([]);
	expect(await db.getMeta('version')).toBe(1);

	const recreated = db.getStore('items');
	await recreated.set('b', '2');
	expect(await recreated.get('b')).toBe('2');
});

test('deleteIndexedDB should remove physical database', async () => {
	const name = uniqueName('indexed-db-delete');
	const db = open(name);
	const store = db.getStore('items');

	await store.set('a', '1');
	await db.setMeta('version', 1);
	await db.dispose();

	await deleteIndexedDB(name);

	const reopened = open(name);
	expect(await reopened.getStoreNames()).toEqual([]);
	expect(await reopened.getMeta('version')).toBeUndefined();
	expect(await reopened.getStore('items').get('a')).toBeUndefined();
});
