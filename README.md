# Uni-KV

Tiny unified KV storage library for browser and Node.

Current backends:

- memory
- IndexedDB

## Install

```bash
bun add uni-kv
```

## Quick start

### Memory backend

```ts
import { openMemoryDB } from 'uni-kv';

const db = openMemoryDB('app');
const users = db.getStore('users');

users.set('u1', { name: 'Ada' });
console.log(users.get('u1'));
```

### IndexedDB backend

```ts
import { openIndexedDB } from 'uni-kv';

const db = await openIndexedDB('app');
const users = await db.getStore('users');

await users.set('u1', { name: 'Ada' });
console.log(await users.get('u1'));
```

## API

### Open / delete database

- `openMemoryDB(name)` → sync database instance
- `deleteMemoryDB(name)` → remove in-memory database from registry
- `openIndexedDB(name)` → async database instance
- `deleteIndexedDB(name)` → close tracked handles and delete physical IndexedDB database

### Database methods

- `getStore(name)`
- `getStoreNames()`
- `deleteStore(name)`
- `clearStores()`
- `getMeta(key)`
- `setMeta(key, value)`

### Store methods

- `get(key)`
- `set(key, value)`
- `delete(key)`
- `clear()`
- `keys()`
- `batch(operations)`

`batch()` returns only `get` results, in operation order.

## Type-safe usage

You can provide record types for store payloads and meta values:

```ts
import { openMemoryDB } from 'uni-kv';

type Stores = {
  users: { name: string };
  logs: string[];
};

type Meta = {
  version: number;
};

const db = openMemoryDB<Stores, Meta>('app');
const users = db.getStore('users');

users.set('u1', { name: 'Ada' });
db.setMeta('version', 1);
```

## Notes

- `openMemoryDB(name)` reuses same database instance for same name.
- `openIndexedDB(name)` lazily creates stores on first access.
- IndexedDB backend keeps internal meta store hidden from `getStoreNames()`.
- `clearStores()` removes all user stores and keeps meta data.

## Dev Scripts

- `bun lint` — format and fix lint issues
- `bun check` — typecheck, lint, format check
- `bun test` — run tests
- `bun run build` — build package

## Blueprint

Canonical spec lives in `blueprint/`.

## License

MIT License | Copyright ©️ 2026 Hesprs (Hēsperus)
