import { runBenchmark, waitForWorker } from '../common/benchmark-worker';
import type { WaSqliteVfs } from './backends';

const workers = new Map<WaSqliteVfs, Promise<Worker>>();

export async function runWaSqlite({
  vfs = 'IDBBatchAtomicVFS',
  ...options
}: {
  batchSize: number;
  source: URL;
  vfs?: WaSqliteVfs;
}): Promise<{ insertDur: number; queryDur: number }> {
  let ready = workers.get(vfs);
  if (!ready) {
    const worker = new Worker(
      new URL('./wa-sqlite-worker.ts', import.meta.url),
      {
        name: `wa-sqlite-${vfs}`,
        type: 'module',
      }
    );
    ready = waitForWorker(worker);
    workers.set(vfs, ready);
    worker.postMessage({ type: 'init', vfs });
  }
  return runBenchmark(await ready, options);
}
