import { runBenchmark, waitForWorker } from '../common/benchmark-worker';

let workerPromise: Promise<Worker> | undefined;

export async function runTurso(options: {
  batchSize: number;
  source: URL;
}): Promise<{ insertDur: number; queryDur: number }> {
  workerPromise ??= waitForWorker(
    new Worker(new URL('./turso-worker.ts', import.meta.url), {
      name: 'turso-worker',
      type: 'module',
    })
  );
  return runBenchmark(await workerPromise, options);
}
