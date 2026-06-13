# IndexedDB Backend

- Has dependency `idb`.
- For `meta` storage of each DB, use a store with a dedicated name.
- For `batch` implementation of each store, do everything inside a transaction. Only return get results.
- When meeting errors, don't swallow, throw directly.
