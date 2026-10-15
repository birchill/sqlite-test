import type { SQLiteVFS } from '../sqlite-api.js';
export declare class AccessHandlePoolVFS {
  static create(name: string, module: any, options?: object): Promise<SQLiteVFS>;
}
