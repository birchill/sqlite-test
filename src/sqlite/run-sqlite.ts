import { runBenchmark, waitForWorker } from '../common/benchmark-worker';

let workerPromise: Promise<Worker> | undefined;

export async function runSqlite(options: {
  batchSize: number;
  source: URL;
}): Promise<{ insertDur: number; queryDur: number }> {
  workerPromise ??= waitForWorker(
    new Worker(new URL('./sqlite-worker.ts', import.meta.url), {
      name: 'sqlite-worker',
      type: 'module',
    })
  );
  return runBenchmark(await workerPromise, options);
}
