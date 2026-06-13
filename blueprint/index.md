# Uni-KV Blueprint

Uni-KV is a tiny library aiming at providing a unified storage interface in browser or Node environment, including backends like IndexedDB, in-memory, localStorage, or SQLite. Each backend has independent implementation of the same interface.

The interface is defined in `src/interface.ts`.

## Structure

Each backend will have their own implementation of `Database`, `Store`, `OpenDB`, and `DeleteDB`. Only functions of type `OpenDB` and `DeleteDB` will become the library's exported runtime API.

Every backend must use its natively implemented types of type `Store`, `Database`, `OpenDB`, and `DeleteDB`, with optional `satisfies` of these types in `src/interface.ts`. Arbitrary type coercion of type `Store`, `Database`, `OpenDB`, and `DeleteDB` from `src/interface.ts` above backend-implemented types is forbidden.

Every backend must implement `Store` and `Database` as classes.

## Backends

Currently, 2 backends are included:

- [In-memory](./memory.md)
- [IndexedDB](./indexed-db.md)
