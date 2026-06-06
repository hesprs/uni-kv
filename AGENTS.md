This is the TypeScript monorepo for Unified Storage, `blueprint/` rests the canonical spec this project wants to achieve.

It contains two packages:

- Uni-CRUD: `packages/uni-crud/`, spec `blueprint/uni-crud/`
- Uni KV: `packages/uni-kv/`, spec `blueprint/uni-kv/`

## Commands

- `bun lint`: format and fix fixable lint errors (always run before `pnpm check`).
- `bun check`: check types, lint and format (no file change).
- `bun build`: build all packages.
- `bun <command> --filter=<package name>`: execute command on a specific package.

## Code Quality

- No non-null assertion
- No explicit `any`
