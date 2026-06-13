# Uni-KV Blueprint

Uni-KV is a tiny library aiming at providing a unified storage interface in browser or Node environment, including backends like IndexedDB, in-memory, localStorage, or SQLite. Each backend has independent implementation of the same interface.

The interface is defined in `src/interface.ts`.

## Structure

Each backend will have their own implementation of `Database`, `Store`, `OpenDB`, and potentially `DeleteDB` for persistent backends. Only functions of type `OpenDatabase` will become the library's exported runtime API.

## Backends

Currently, 2 backends are included:

- [In-memory](./memory.md)
- [IndexedDB](./indexed-db.md)
