import type { SQLiteVFS } from '../sqlite-api.js';
export declare class IDBBatchAtomicVFS {
  static create(name: string, module: any, options?: object): Promise<SQLiteVFS>;
}
