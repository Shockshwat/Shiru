<script>
  import { click } from '@/modules/click.js'
  import { sections } from '@/modules/sections.js'
  import { SUPPORTS } from '@/modules/support.js'
  import CustomDropdown from '@/components/CustomDropdown.svelte'
  import { ArrowDown, ArrowDownUp, ArrowUp, Trash2 } from 'lucide-svelte'

  const allowedHomeSections = sections.map(({ title, sort, format }) => [title, sort, format])
  export let homeSections

  let mouseYCoordinate = null // pointer y coordinate within client
  let distanceTopGrabbedVsPointer = null

  let draggingItem = null
  let draggingItemIndex = null
  let hoveredItemIndex = null

  $: {
    if (draggingItemIndex != null && hoveredItemIndex != null && draggingItemIndex !== hoveredItemIndex) {
      swapItem(draggingItemIndex, hoveredItemIndex)
      draggingItemIndex = hoveredItemIndex
    }
  }

  function swapItem (a, b) {
    b = Math.min(homeSections.length - 1, Math.max(0, b))
    ;[homeSections[a], homeSections[b]] = [homeSections[b], homeSections[a]]
  }
</script>

{#if mouseYCoordinate}
  <div class='input-group mb-10 ghost w-full' style='top: {mouseYCoordinate + distanceTopGrabbedVsPointer}px;'>
    <div class='input-group-prepend'>
      <span class='input-group-text d-flex align-items-center px-5'><ArrowDownUp size='1.8rem' /></span>
    </div>
    <select class='form-control'></select>
    <select class='form-control'></select>
    <select class='form-control'></select>
    <div class='input-group-append'>
      <button type='button' class='btn btn-danger btn-square input-group-append px-5 d-flex align-items-center'><Trash2 size='1.8rem' /></button>
    </div>
  </div>
{/if}
{#each homeSections as item, index}
  {#if index === 0}
    <div class='d-flex mb-5 w-509 mw-full'>
      <div class='flex-shrink-1 w-150 font-size-16 text-center font-weight-bold' style='margin-left: 2.5rem'>Section</div>
      <div class='flex-shrink-1 w-150 font-size-16 text-center font-weight-bold'>Sort</div>
      <div class='flex-shrink-1 w-150 ml-10 font-size-16 text-center font-weight-bold'>Format</div>
      <div class='flex-shrink-1 font-size-16 text-center font-weight-bold' style='width: 3rem'>&nbsp;</div>
    </div>
  {/if}
  <div class='d-flex mb-10 w-509 mw-full not-reactive' class:tp={draggingItem === item} role='menuitem' tabindex='0'>
    {#if !SUPPORTS.isAndroid}
      <div class='input-group-prepend grab' class:tp={draggingItem === item} draggable='true' role='menuitem' tabindex='0' on:dragstart={({ clientY, target }) => { mouseYCoordinate = clientY; draggingItem = item; draggingItemIndex = index; distanceTopGrabbedVsPointer = target.offsetTop - clientY } } on:drag={e => { mouseYCoordinate = e.clientY }} on:dragover={() => { hoveredItemIndex = index }} on:dragend={() => { mouseYCoordinate = null; draggingItem = null; hoveredItemIndex = null; } }>
        <span class='input-group-text d-flex align-items-center px-5'><ArrowDownUp size='1.8rem' /></span>
      </div>
    {:else}
      <div class='input-group-prepend'>
        <button use:click={() => swapItem(index, index - 1)} class='input-group-text d-flex align-items-center px-5 pointer'><ArrowUp size='1.8rem' /></button>
      </div>
      <div class='input-group-prepend'>
        <button use:click={() => swapItem(index, index + 1)} class='input-group-text d-flex align-items-center px-5 pointer'><ArrowDown size='1.8rem' /></button>
      </div>
    {/if}
    <div class='position-relative flex-shrink-1 w-150 mw-full'>
      <select class='form-control flex-shrink-1 bg-dark fix-border' on:change={(event) => { if (event.target.value !== homeSections[index][0]) homeSections[index] = allowedHomeSections.find(([title]) => title === event.target.value) }} bind:value={homeSections[index][0]}>
        {#each allowedHomeSections as section}
          {#if !homeSections.some(([title]) => title === section[0]) || homeSections[index][0] === section[0]}
            <option>{section[0]}</option>
          {/if}
        {/each}
      </select>
    </div>
    <div class='position-relative flex-shrink-1 w-150 bg-dark mw-full'>
      {(homeSections[index][1]?.includes('N/A') && homeSections[index][1] !== 'N/A') ? (homeSections[index][1] = 'N/A') : ''} <!-- hack because shit be weird sometimes -->
      <select class='form-control bg-dark fix-border' bind:value={homeSections[index][1]} disabled={homeSections[index][1]}>
        <option value='N/A' selected hidden>N/A</option>
        <option value='TRENDING_DESC'>Trending</option>
        <option value='POPULARITY_DESC'>Popularity</option>
        <option value='TITLE_ROMAJI'>Title</option>
        <option value='SCORE_DESC'>Score</option>
        <option value='START_DATE_DESC'>Release Date</option>
        {#if !homeSections[index][0].includes('Missed') && (homeSections[index][0].includes('Watching') || homeSections[index][0].includes('Completed') || homeSections[index][0].includes('Planning') || homeSections[index][0].includes('Paused') || homeSections[index][0].includes('Dropped')) }
          {#if homeSections[index][0].includes('Completed')}
            <option value='FINISHED_ON_DESC'>Completed Date</option>
          {/if}
          {#if !homeSections[index][0].includes('Planning')}
            <option value='STARTED_ON_DESC'>Start Date</option>
          {/if}
          <option value='UPDATED_TIME_DESC'>Last Updated</option>
          {#if !homeSections[index][0].includes('Completed') && !homeSections[index][0].includes('Planning')}
            <option value='PROGRESS_DESC'>Your Progress</option>
          {/if}
          {#if homeSections[index][0].includes('Completed') || homeSections[index][0].includes('Dropped')}
            <option value='USER_SCORE_DESC'>Your Score</option>
          {/if}
        {/if}
      </select>
    </div>
    <div class='position-relative flex-shrink-1 w-150 bg-dark'>
      <CustomDropdown id={`format-hs-${index}`} options={{ TV: 'TV Show', MOVIE: 'Movie', TV_SHORT: 'TV Short', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA' }} bind:value={homeSections[index][2]}/>
    </div>
    <div class='input-group-append'>
      <button type='button' use:click={() => { homeSections.splice(index, 1); homeSections = homeSections }} class='btn btn-danger btn-square input-group-append px-5 d-flex align-items-center'><Trash2 size='1.8rem' /></button>
    </div>
  </div>
{/each}
<button type='button' class='btn btn-primary text-center' disabled={allowedHomeSections.every(([title]) => homeSections.some(([existingTitle]) => existingTitle === title))} use:click={() => { const remainingSections = allowedHomeSections.filter(([title]) => !homeSections.some(([existingTitle]) => existingTitle === title)); if (remainingSections.length > 0) homeSections = [...homeSections, remainingSections[Math.floor(Math.random() * remainingSections.length)]] }}>Add Section</button>

<style>
  .w-509 {
    width: 50.9rem;
  }

  .fix-border {
    border-radius: 0 !important;
  }

  .ghost {
    margin-bottom: 10px;
    pointer-events: none;
    z-index: 9999;
    position: absolute !important;
  }

  .tp {
    opacity: 0;
  }

  .grab{
    cursor: grab;
  }
</style>
