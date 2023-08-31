import { isObject } from '../utils/is-object';

export async function runSqlite({
  batchSize,
  source,
}: {
  batchSize: number;
  source: URL;
}): Promise<number> {
  // Create worker and wait for it to be ready
  const worker = await getWorker();

  return new Promise((resolve, reject) => {
    function onError(e: any) {
      unregister();
      reject(e);
    }

    function onMessage(m: MessageEvent<any>) {
      if (!isObject(m.data)) {
        unregister();
        reject(new Error(`Got unexpected message: ${JSON.stringify(m)}`));
      }

      if (typeof m.data.type !== 'string' || m.data.type !== 'result') {
        unregister();
        reject(new Error(`Got unexpected message: ${JSON.stringify(m)}`));
      }

      if (typeof m.data.dur !== 'number') {
        unregister();
        reject(new Error(`Got unexpected message: ${JSON.stringify(m)}`));
      }

      unregister();
      resolve(m.data.dur);
    }

    function unregister() {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onError);
      worker.removeEventListener('unhandledrejection', onError);
    }

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onError);
    worker.addEventListener('unhandledrejection', onError);

    worker.postMessage({ type: 'start', batchSize, source: source.toString() });
  });
}

let workerPromise: Promise<Worker> | undefined;

function getWorker() {
  if (!workerPromise) {
    workerPromise = new Promise<Worker>((resolve, reject) => {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), {
        name: 'worker',
        type: 'module',
      });

      worker.addEventListener('error', reject);
      worker.addEventListener(
        'message',
        (msg) => {
          worker.removeEventListener('error', reject);
          msg.data === 'ready' ? resolve(worker) : reject(msg);
        },
        { once: true }
      );
    });
  }

  return workerPromise;
}
