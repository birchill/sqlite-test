export function waitForWorker(worker: Worker): Promise<Worker> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      worker.removeEventListener('error', onError);
      worker.removeEventListener('message', onMessage);
    }
    function onError(event: ErrorEvent) {
      cleanup();
      worker.terminate();
      reject(new Error(event.message));
    }
    function onMessage(event: MessageEvent) {
      cleanup();
      if (event.data === 'ready') {
        resolve(worker);
      } else {
        worker.terminate();
        reject(
          new Error(event.data?.message ?? 'Worker initialization failed')
        );
      }
    }
    worker.addEventListener('error', onError);
    worker.addEventListener('message', onMessage);
  });
}

export function runBenchmark(
  worker: Worker,
  options: { batchSize: number; source: URL }
): Promise<{ insertDur: number; queryDur: number }> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onError);
    }
    function onError(event: Event) {
      cleanup();
      reject(
        new Error(
          event instanceof ErrorEvent ? event.message : 'Worker message error'
        )
      );
    }
    function onMessage(event: MessageEvent) {
      cleanup();
      const data = event.data;
      if (
        data?.type === 'result' &&
        Number.isFinite(data.insertDur) &&
        Number.isFinite(data.queryDur)
      ) {
        resolve({ insertDur: data.insertDur, queryDur: data.queryDur });
      } else {
        reject(new Error(data?.message ?? 'Unexpected worker response'));
      }
    }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onError);
    worker.postMessage({
      type: 'start',
      batchSize: options.batchSize,
      source: options.source.toString(),
    });
  });
}
