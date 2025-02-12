<script>
  import { getContext } from 'svelte'
  import PreviewCard from './PreviewCard.svelte'
  import { episode, airingAt, formatMap, statusColorMap } from '@/modules/anime.js'
  import { createListener } from '@/modules/util.js'
  import { hoverClick } from '@/modules/click.js'
  import AudioLabel from '@/views/ViewAnime/AudioLabel.svelte'

  import { page } from '@/App.svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { mediaCache } from '@/modules/cache.js'
  import { CalendarDays, Tv, ThumbsUp, ThumbsDown } from 'lucide-svelte'

  /** @type {import('@/modules/al.d.ts').Media} */
  export let data
  export let type = null
  export let variables = null
  let _variables = variables

  $: media = data && $mediaCache[data?.id]
  const view = getContext('view')
  function viewMedia () {
    $view = media
  }

  let preview = false
  function setHoverState (state) {
    preview = state
  }

  const { reactive, init } = createListener(['btn', 'scoring', 'sound'])
  $: init(preview)
</script>

<div class='d-flex p-md-20 p-15 position-relative first-check {$reactive ? `` : `not-reactive`}' use:hoverClick={[viewMedia, setHoverState, viewMedia]}>
  {#if preview}
    <PreviewCard {media} {type} variables={_variables} />
  {/if}
  <div class='item small-card d-flex flex-column pointer'>
    {#if $page === 'schedule'}
      <div class='w-full text-center pb-10'>
        {#if airingAt(media, _variables)}
          {episode(media, _variables)}&nbsp;
          <span class='font-weight-bold text-light'>
            {airingAt(media, _variables)}
          </span>
        {:else}
          &nbsp;
        {/if}
      </div>
    {/if}
    <div class='d-inline-block position-relative'>
      <img loading='lazy' src={media.coverImage.extraLarge || ''} alt='cover' class='cover-img w-full rounded' style:--color={media.coverImage.color || '#1890ff'} />
      {#if !_variables?.scheduleList}
        <AudioLabel {media} />
      {/if}
    </div>
    {#if type || type === 0}
      <div class='context-type d-flex align-items-center'>
        {#if Number.isInteger(type) && type >= 0}
          <ThumbsUp fill='currentColor' class='pr-5 pb-5 {type === 0 ? "text-muted" : "text-success"}' size='2rem' />
        {:else if Number.isInteger(type) && type < 0}
          <ThumbsDown fill='currentColor' class='text-danger pr-5 pb-5' size='2rem' />
        {/if}
        {(Number.isInteger(type) ? Math.abs(type).toLocaleString() + (type >= 0 ? ' likes' : ' dislikes') : type)}
      </div>
    {/if}
    <div class='text-white font-weight-very-bold font-size-16 title overflow-hidden' class:mb-10={type || type === 0}>
      {#if media.mediaListEntry?.status}
        <div style:--statusColor={statusColorMap[media.mediaListEntry.status]} class='list-status-circle d-inline-flex overflow-hidden mr-5' title={media.mediaListEntry.status} />
      {/if}
      {anilistClient.title(media)}
    </div>
    <div class='d-flex flex-row mt-auto font-weight-medium justify-content-between w-full text-muted'>
      <div class='d-flex align-items-center pr-5'>
        <CalendarDays class='pr-5' size='2.6rem' />
        <span class='line-height-1'>{media.seasonYear || 'N/A'}</span>
      </div>
      <div class='d-flex align-items-center text-nowrap text-right'>
        <span class='line-height-1'>{formatMap[media.format]}</span>
        <Tv class='pl-5' size='2.6rem' />
      </div>
    </div>
  </div>
</div>

<style>
  .first-check:hover {
    z-index: 30;
    /* fixes transform scaling on click causing z-index issues */
  }
  .title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.2;
  }
  img {
    width: 100%;
    aspect-ratio: 230/331;
  }
  .item {
    animation: 0.3s ease 0s 1 load-in;
    width: 100%;
    aspect-ratio: 152/296;
  }
  .cover-img {
    background-color: var(--color) !important;
  }
  .list-status-circle {
    background: var(--statusColor);
    height: 1.1rem;
    width: 1.1rem;
    border-radius: 50%;
  }
</style>
