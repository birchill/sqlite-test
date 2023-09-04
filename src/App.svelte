<script lang="ts">
  import { runIdb } from './idb/run-idb';
  import { runSqlite } from './sqlite/run-sqlite';

  const inProgress = Symbol('in progress');
  const runs = 3;
  const testConfigurations = {
    IndexedDB: (source: string) =>
      runIdb({
        batchSize: 2000,
        source: new URL(source, document.location.toString()),
      }),
    'SQLite OPFS SAH': (source: string) =>
      runSqlite({
        batchSize: 2000,
        source: new URL(source, document.location.toString()),
      }),
  };

  let running = false;

  let results = Object.fromEntries(
    Object.keys(testConfigurations).map((key) => [key, Array(runs).fill(0)])
  );

  async function runTests() {
    results = Object.fromEntries(
      Object.keys(testConfigurations).map((key) => [key, Array(runs).fill(0)])
    );

    const sources = [
      '/data/2.0.191-1.jsonl',
      '/data/2.0.191-2.jsonl',
      '/data/2.0.191-3.jsonl',
    ];

    for (const [name, test] of Object.entries(testConfigurations)) {
      for (let i = 0; i < runs; i++) {
        results[name]![i] = inProgress;
        const result = await test(sources[i]!);
        results[name]![i] = result;
      }
    }
  }
</script>

<button
  disabled={running}
  on:click={() => {
    if (running) {
      return;
    }

    running = true;
    runTests().finally(() => {
      running = false;
    });
  }}>Run test</button
>

<p>Results:</p>

<div class="results-table">
  <div>Configuration</div>
  <div>Run #1</div>
  <div>Run #2</div>
  <div>Run #3</div>
  {#each Object.entries(results) as [name, runs]}
    <div>{name}</div>
    {#each runs as run}
      <div>{run === inProgress ? '⌛️' : run ? `${run}ms` : '--'}</div>
    {/each}
  {/each}
</div>

<style>
  .results-table {
    display: inline-grid;
    grid-template-columns: auto repeat(3, 1fr);
    gap: 0.5rem 2rem;
  }
</style>
