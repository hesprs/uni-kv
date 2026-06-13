# Memory Backend

- File: `src/backends/memory.ts`.
- Public API: `openMemoryDB`, `deleteMemoryDB`
- All opened databases kept in a global registry. `OpenDB` with the same name returns the same database.
- Uses native TypeScript `Map` for store implementation.
- All methods are synchronous.
- Database `meta` uses plain TypeScript object.
