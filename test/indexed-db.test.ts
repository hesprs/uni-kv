import { expect, test } from 'bun:test';
// oxlint-disable-next-line import/no-unassigned-import
import 'fake-indexeddb/auto';
import { deleteIndexedDB, openIndexedDB } from '../src/backends/indexed-db';

const open = (name: string) => openIndexedDB<Record<string, string>, { version: number }>(name);
const uniqueName = (label: string) =>
	`${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('openIndexedDB should create reusable database with meta store hidden from getStoreNames', async () => {
	const name = uniqueName('indexed-db-open-meta');
	const db = await open(name);

	await db.setMeta('version', 1);
	expect(await db.getStoreNames()).toEqual([]);

	const reopened = await open(name);
	expect(await reopened.getMeta('version')).toBe(1);
	expect(await reopened.getStoreNames()).toEqual([]);
});

test('IndexedDBDatabase should create store on first getStore call', async () => {
	const db = await open(uniqueName('indexed-db-lazy-store'));

	await db.getStore('items');
	expect(await db.getStoreNames()).toEqual(['items']);
});

test('IndexedDBStore wrappers should keep working after later schema upgrades', async () => {
	const db = await open(uniqueName('indexed-db-upgrade'));
	const users = await db.getStore('users');

	await users.set('a', '1');
	await db.getStore('logs');
	await users.set('b', '2');

	expect(await users.get('b')).toBe('2');
});

test('IndexedDBStore CRUD and keys should work through idb helpers', async () => {
	const db = await open(uniqueName('indexed-db-crud'));
	const store = await db.getStore('items');

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
	const db = await open(uniqueName('indexed-db-batch'));
	const store = await db.getStore('items');

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
	const db = await open(uniqueName('indexed-db-meta'));

	await db.setMeta('version', 7);
	expect(await db.getMeta('version')).toBe(7);
	expect(await db.getStoreNames()).toEqual([]);
});

test('IndexedDBDatabase clearStores should keep database usable', async () => {
	const db = await open(uniqueName('indexed-db-clear'));
	const store = await db.getStore('items');

	await store.set('a', '1');
	await db.setMeta('version', 1);
	await db.clearStores();

	expect(await db.getStoreNames()).toEqual([]);
	expect(await db.getMeta('version')).toBe(1);

	const recreated = await db.getStore('items');
	await recreated.set('b', '2');
	expect(await recreated.get('b')).toBe('2');
});

test('deleteIndexedDB should remove physical database', async () => {
	const name = uniqueName('indexed-db-delete');
	const db = await open(name);
	const store = await db.getStore('items');

	await store.set('a', '1');
	await db.setMeta('version', 1);

	await deleteIndexedDB(name);

	const reopened = await open(name);
	expect(await reopened.getStoreNames()).toEqual([]);
	expect(await reopened.getMeta('version')).toBeUndefined();
	expect(await (await reopened.getStore('items')).get('a')).toBeUndefined();
});
