import { isObject } from '../utils/is-object';

export async function runSqlite({
  batchSize,
  source,
}: {
  batchSize: number;
  source: URL;
}): Promise<number> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    name: 'worker',
    type: 'module',
  });

  return new Promise((resolve, reject) => {
    worker.addEventListener('message', (m) => {
      if (!isObject(m.data)) {
        reject(new Error(`Got unexpected message: ${JSON.stringify(m)}`));
      }

      if (typeof m.data.type !== 'string' || m.data.type !== 'result') {
        reject(new Error(`Got unexpected message: ${JSON.stringify(m)}`));
      }

      if (typeof m.data.dur !== 'number') {
        reject(new Error(`Got unexpected message: ${JSON.stringify(m)}`));
      }

      resolve(m.data.dur);
    });

    worker.addEventListener('error', (e) => {
      reject(e);
    });
    worker.addEventListener('messageerror', (e) => {
      reject(e);
    });
    worker.addEventListener('unhandledrejection', (e) => {
      reject(e);
    });

    worker.postMessage({ type: 'start', batchSize, source });
  });
}
