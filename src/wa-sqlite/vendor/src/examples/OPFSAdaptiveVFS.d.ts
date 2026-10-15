import type { SQLiteVFS } from '../sqlite-api.js';
export declare class OPFSAdaptiveVFS {
  static create(name: string, module: any, options?: object): Promise<SQLiteVFS>;
}
