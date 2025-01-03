<script>
  import { click } from '@/modules/click.js'
  import ToggleTitle from '@/views/ViewAnime/ToggleTitle.svelte'

  export let list = null
  let showMore = false
  function toggleList () {
    showMore = !showMore
  }
  export let title = 'Relations'
  export let promise = null
</script>
{#if list?.length}
  {#if list.length > 4}
    <span class='d-flex align-items-end pointer' use:click={toggleList}>
      <ToggleTitle size={list.length} title={title} showMore={showMore}></ToggleTitle>
    </span>
  {:else}
    <span class='d-flex align-items-end'>
      <ToggleTitle size={list.length} title={title} showMore={showMore}></ToggleTitle>
    </span>
  {/if}
  <div class='d-flex text-capitalize flex-wrap pt-10 justify-content-center gallery'>
    {#each list.slice(0, showMore ? 100 : 4) as item}
      <slot {item} {promise} />
    {/each}
  </div>
{/if}

<style>
  .gallery :global(.first-check:first-child) :global(.absolute-container) {
    left: -48% !important;
  }
</style>
