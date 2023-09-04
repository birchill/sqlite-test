<script lang="ts">
  import { runIdb } from './idb/run-idb';
  import { runSqlite } from './sqlite/run-sqlite';

  import RunTime from './RunTime.svelte';

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
    Object.keys(testConfigurations).map((key) => [
      key,
      Array(runs + 1).fill(null),
    ])
  );

  async function runTests() {
    results = Object.fromEntries(
      Object.keys(testConfigurations).map((key) => [
        key,
        Array(runs + 1).fill(null),
      ])
    );

    let baseline = null;
    for (const [name, test] of Object.entries(testConfigurations)) {
      if (!baseline) {
        baseline = name;
      }

      for (let i = 0; i < runs; i++) {
        results[name]![i] = inProgress;
        const dur = await test('/data/2.0.191-10k.jsonl');
        const diffMs = baseline === name ? 0 : dur - results[baseline]![i].dur;
        const diffPercent = (diffMs / dur) * 100;
        results[name]![i] = { dur, diffMs, diffPercent };
      }

      const average =
        results[name]!.slice(0, runs).reduce((acc, { dur }) => acc + dur, 0) /
        runs;
      const diffMs =
        baseline === name ? 0 : average - results[baseline]![runs].dur;
      const diffPercent = (diffMs / average) * 100;
      results[name]![runs] = { dur: average, diffMs, diffPercent };
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
  <div class="heading">Configuration</div>
  {#each Array.from({ length: runs }, (_, i) => i + 1) as index}
    <div class="heading">Run #{index}</div>
  {/each}
  <div class="heading">Average</div>
  {#each Object.entries(results) as [name, runs]}
    <div>{name}</div>
    {#each runs as run}
      <div>
        {#if run === inProgress}
          ⌛️
        {:else if run}
          <RunTime {...run} />
        {:else}
          --
        {/if}
      </div>
    {/each}
  {/each}
</div>

<style>
  .results-table {
    display: inline-grid;
    grid-template-columns: auto repeat(4, 1fr);
    gap: 0.5rem 2rem;
  }

  .results-table .heading {
    font-weight: bold;
  }
</style>
