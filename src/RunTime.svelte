<script lang="ts">
  import {
    formatMilliseconds,
    formatStandardDeviation,
  } from './common/benchmark-results';

  export let dur: number;
  export let diffMs: number;
  export let diffPercent: number;
  export let stdDev: number | undefined = undefined;

  $: variability = formatStandardDeviation(dur, stdDev);
</script>

<div class="duration">
  {formatMilliseconds(dur)}{#if variability !== undefined}{' '}<span
      class="variability"
      title="Sample standard deviation as a percentage of the mean"
      >±{variability}</span
    >{/if}
</div>
{#if diffMs !== 0}
  <div class:slower={diffMs > 0} class:faster={diffMs < 0} class="comparison">
    {diffMs > 0 ? '+' : ''}{formatMilliseconds(diffMs)}
    ({diffPercent > 0 ? '+' : ''}{Number(diffPercent.toFixed(2))}%)
  </div>
{/if}

<style>
  .duration {
    white-space: nowrap;
    font-weight: 400;
    color: #1c2b40;
  }

  .variability {
    color: #65748a;
    font-size: 0.85em;
    font-weight: 400;
  }

  .comparison {
    margin-top: 0.2rem;
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .faster {
    color: #267155;
  }
  .slower {
    color: #9a5036;
  }
</style>
