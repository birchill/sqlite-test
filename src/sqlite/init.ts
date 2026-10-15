import sqlite3InitModule from '@birchill/nice-sqlite-wasm';
import wasmUrl from '@birchill/nice-sqlite-wasm/sqlite3.wasm?url';

export type SQLite = Awaited<ReturnType<typeof sqlite3InitModule>>;
export type OpfsSAHPoolUtil = Awaited<
  ReturnType<SQLite['installOpfsSAHPoolVfs']>
>;

export type DB = InstanceType<OpfsSAHPoolUtil['OpfsSAHPoolDb']>;

export function initSQLite() {
  return sqlite3InitModule({
    emscriptenLocateFile: () => wasmUrl,
  });
}
