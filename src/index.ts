export type * from './interface';
export { deleteIndexedDB, openIndexedDB } from './backends/indexed-db';
export { deleteMemoryDB, openMemoryDB } from './backends/memory';
