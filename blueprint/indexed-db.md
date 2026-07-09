# IndexedDB Backend

- File: `src/backends/indexed-db.ts`.
- Public API: `openIndexedDB`, `deleteIndexedDB`.
- Has dependency `idb`.
- Testing uses `fake-indexeddb`.
- For `meta` storage of each DB, use a store with a dedicated name.
- When meeting errors, don't swallow, throw directly.
- For `batch` implementation of each store, do everything inside a transaction. Only return get results. If the batch operations only contain `get`, use `readonly` mode. otherwise use `readwrite`.
- Batch transaction are isolated per store. The transaction operations are awaited in `Promise.all`, then complete after `await tx.done`.
- For other non-batch store operations, use `idb` provided simplified versions `put`, `get`, `delete`.
- `getStoreNames()` ignores the dedicated meta store.
- Use lock to prevent race condition on store creation.
