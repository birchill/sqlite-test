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

    for (const [name, test] of Object.entries(testConfigurations)) {
      for (let i = 0; i < runs; i++) {
        results[name]![i] = inProgress;
        const result = await test('/data/2.0.191-10k.jsonl');
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
  {#each Array.from({ length: runs }, (_, i) => i + 1) as index}
    <div>Run #{index}</div>
  {/each}
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
