import type { Ref } from 'synthkernel';

// oxlint-disable-next-line typescript/consistent-type-definitions
export default interface CrudFs {
	getUid(): string;
	read(key: string, progress?: Ref<Progress>): MaybePromise<ArrayBuffer>;
	readStream(key: string, progress?: Ref<Progress>): MaybePromise<ReadableStream>;
	write(key: string, value: ArrayBuffer, progress?: Ref<Progress>): MaybePromise<string>; // Returns uid
	writeStream(key: string, value: ReadableStream, progress?: Ref<Progress>): MaybePromise<string>; // Returns uid
	move(oldKey: string, newKey: string): MaybePromise<void>;
	copy(sourceKey: string, targetKey: string): MaybePromise<void>;
	delete(key: string, progress?: Ref<Progress>): MaybePromise<void>;
	mkdir(key: string, progress?: Ref<Progress>): MaybePromise<void>;
	exists(key: string, progress?: Ref<Progress>): MaybePromise<boolean>;
	stat(key: string, progress?: Ref<Progress>): MaybePromise<Stat>;
	list(key: string, progress?: Ref<Progress>): MaybePromise<Array<Stat>>; // List direct children under one folder
	listAll(key: string, progress?: Ref<Progress>): MaybePromise<Array<Stat>>; // List recursive children under one folder
}

type MaybePromise<T> = Promise<T> | T;
export type Progress = { total: number; completed: number };
export type Stat = {
	isDir: boolean;
	key: string;
	mtime: number;
	size: number;
	// Etag or other kinds of string whose equality signifies the file is unchanged
	uid: string;
};
