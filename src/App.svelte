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
        const result = await test('/data/2.0.191-10k.jsonl');

        const insert = { dur: result.insertDur, diffMs: 0, diffPercent: 0 };
        if (name !== baseline) {
          insert.diffMs = insert.dur - results[baseline]![i].insert.dur;
          insert.diffPercent = (insert.diffMs / insert.dur) * 100;
        }

        const query = { dur: result.queryDur, diffMs: 0, diffPercent: 0 };
        if (name !== baseline) {
          query.diffMs = query.dur - results[baseline]![i].query.dur;
          query.diffPercent = (query.diffMs / query.dur) * 100;
        }

        results[name]![i] = { insert, query };
      }

      const averageInsertDur =
        results[name]!.slice(0, runs).reduce(
          (acc, { insert: { dur } }) => acc + dur,
          0
        ) / runs;
      const insert = { dur: averageInsertDur, diffMs: 0, diffPercent: 0 };

      if (name !== baseline) {
        insert.diffMs = insert.dur - results[baseline]![runs].insert.dur;
        insert.diffPercent = (insert.diffMs / insert.dur) * 100;
      }

      const averageQueryDur =
        results[name]!.slice(0, runs).reduce(
          (acc, { query: { dur } }) => acc + dur,
          0
        ) / runs;
      const query = { dur: averageQueryDur, diffMs: 0, diffPercent: 0 };

      if (name !== baseline) {
        query.diffMs = query.dur - results[baseline]![runs].query.dur;
        query.diffPercent = (query.diffMs / query.dur) * 100;
      }

      results[name]![runs] = { insert, query };
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

<div
  class="results-table"
  style={`grid-template-columns: auto repeat(${runs + 0}, 1fr) auto;`}
>
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
          <div class="result-section">
            <span class="label">Insert:</span>
            <RunTime {...run.insert} />
            <span class="label">Query:</span>
            <RunTime {...run.query} />
          </div>
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
    gap: 0.5rem 2rem;
  }

  .results-table .heading {
    font-weight: bold;
  }
</style>
