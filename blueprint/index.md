# Uni-KV Blueprint

Uni-KV is a tiny library aiming at providing a unified storage interface in browser or Node environment, including backends like IndexedDB, in-memory, localStorage, or SQLite. Each backend has independent implementation of the same interface.

The interface is defined in `src/interface.ts`.

## Structure

Each backend will have their own implementation of `Database`, `Store`, `OpenDB`, and `DeleteDB`. Only functions of type `OpenDB` and `DeleteDB` will become the library's exported runtime API.

Every backend must preserve its naturally inferred types of `Store`, `Database`, `OpenDB`, and `DeleteDB` implementation, with `satisfies` or `implements` of these types from `src/interface.ts`. Arbitrary type coercion (`a: Type` or `a as Type`) of type `Store`, `Database`, `OpenDB`, and `DeleteDB` directly from `src/interface.ts` above backend-implemented types is forbidden. What does it mean:

```TypeScript
export const openMemoryDB: OpenDB = () => { ... };
const getStore = () => { return store as unknown as Store };
```

Above is forbidden, let the type infer naturally or use allowed `satisfies` or `implements`:

```TypeScript
export const openMemoryDB = () => { ... }; // infer !! OpenDB must use infer since OpenDB has parameters, and TypeScript has a flaw that parameterized types cannot satisfy each other
export const closeMemoryDB = (() => { ... }) satisfies CloseDB; // satisfies
class MemoryStore<T> implements Store<T> {} // implements
```

Every backend must implement `Store` and `Database` as classes.

## Backends

Currently, 2 backends are included:

- [In-memory](./memory.md)
- [IndexedDB](./indexed-db.md)
