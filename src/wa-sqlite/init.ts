import * as SQLite from './vendor/src/sqlite-api.js';
import SQLiteESMFactory from './vendor/dist/wa-sqlite.mjs';
import SQLiteAsyncESMFactory from './vendor/dist/wa-sqlite-async.mjs';
import syncWasmUrl from './vendor/dist/wa-sqlite.wasm?url';
import asyncWasmUrl from './vendor/dist/wa-sqlite-async.wasm?url';
import { IDBBatchAtomicVFS } from './vendor/src/examples/IDBBatchAtomicVFS.js';
import { OPFSAdaptiveVFS } from './vendor/src/examples/OPFSAdaptiveVFS.js';
import { AccessHandlePoolVFS } from './vendor/src/examples/AccessHandlePoolVFS.js';
import { OPFSCoopSyncVFS } from './vendor/src/examples/OPFSCoopSyncVFS.js';
import { OPFSWriteAheadVFS } from './vendor/src/examples/OPFSWriteAheadVFS.js';
import type { WaSqliteVfs } from './backends';

export async function initWaSqlite(
  name: WaSqliteVfs,
  storageName = `benchmark-${name}`
) {
  if (name !== 'IDBBatchAtomicVFS') {
    if (typeof navigator.storage?.getDirectory !== 'function') {
      throw new DOMException(
        'OPFS is unavailable in this browser.',
        'NotSupportedError'
      );
    }
    if (name === 'OPFSWriteAheadVFS') await requireUnsafeAccessHandles();
  }

  const async = name === 'IDBBatchAtomicVFS' || name === 'OPFSAdaptiveVFS';
  const module = await (async ? SQLiteAsyncESMFactory : SQLiteESMFactory)({
    locateFile: () => (async ? asyncWasmUrl : syncWasmUrl),
  });
  const sqlite3 = SQLite.Factory(module);
  const classes = {
    IDBBatchAtomicVFS,
    OPFSAdaptiveVFS,
    AccessHandlePoolVFS,
    OPFSCoopSyncVFS,
    OPFSWriteAheadVFS,
  };
  const vfs = await classes[name].create(
    storageName,
    module,
    name === 'IDBBatchAtomicVFS' ? { durability: 'relaxed' } : undefined
  );
  sqlite3.vfs_register(vfs, true);
  return { sqlite3, vfs };
}

async function requireUnsafeAccessHandles() {
  const directory = await navigator.storage.getDirectory();
  const filename = `.wa-sqlite-probe-${crypto.randomUUID()}`;
  const handles: Array<{ close(): void }> = [];
  try {
    const file = await directory.getFileHandle(filename, { create: true });
    // Open twice: older browsers can silently ignore the mode option.
    handles.push(
      // @ts-expect-error readwrite-unsafe is not yet in TypeScript's DOM types.
      await file.createSyncAccessHandle({ mode: 'readwrite-unsafe' })
    );
    handles.push(
      // @ts-expect-error readwrite-unsafe is not yet in TypeScript's DOM types.
      await file.createSyncAccessHandle({ mode: 'readwrite-unsafe' })
    );
  } catch (error) {
    if (
      (error instanceof DOMException &&
        [
          'TypeError',
          'NotSupportedError',
          'NoModificationAllowedError',
        ].includes(error.name)) ||
      error instanceof TypeError
    ) {
      throw new DOMException(
        'OPFSWriteAheadVFS requires readwrite-unsafe access handles.',
        'NotSupportedError'
      );
    }
    throw error;
  } finally {
    for (const handle of handles) handle.close();
    await directory.removeEntry(filename);
  }
}
