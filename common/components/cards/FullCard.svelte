<script>
  import { getContext } from 'svelte'
  import { airingAt, episode, formatMap, getMediaMaxEp, statusColorMap } from '@/modules/anime.js'
  import { click } from '@/modules/click.js'
  import { page } from '@/App.svelte'
  import { SUPPORTS } from '@/modules/support.js'
  import AudioLabel from '@/views/ViewAnime/AudioLabel.svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { mediaCache } from '@/modules/cache.js'
  /** @type {import('@/modules/al.d.ts').Media} */
  export let data
  export let variables = null
  let _variables = variables

  let media
  $: if (data && !media) {
    media = mediaCache.value[data?.id]
  }
  mediaCache.subscribe((value) => { if (value && (JSON.stringify(value[media?.id]) !== JSON.stringify(media))) media = value[media?.id] })
  $: maxEp = getMediaMaxEp(media)

  const view = getContext('view')
  function viewMedia () {
    $view = media
  }
</script>

<div class='d-flex px-md-20 py-10 position-relative justify-content-center' use:click={viewMedia}>
  <div class='card m-0 p-0 pointer full-card' style:--color={media.coverImage.color || '#1890ff'}>
    <div class='row h-full'>
      <div class='img-col d-inline-block position-relative' class:col-4={!SUPPORTS.isAndroid} class:col-3={SUPPORTS.isAndroid}>
        <img loading='lazy' src={media.coverImage.extraLarge || ''} alt='cover' class='cover-img w-full h-full' />
        {#if !_variables?.scheduleList}
          <AudioLabel {media} smallCard={false} />
        {/if}
      </div>
      <div class='col h-full card-grid'>
        <div class='px-15 py-10 bg-very-dark'>
          <h5 class='m-0 text-white text-capitalize font-weight-bold title'>
            {#if media.mediaListEntry?.status}
              <div style:--statusColor={statusColorMap[media.mediaListEntry.status]} class='list-status-circle d-inline-flex overflow-hidden mr-5' title={media.mediaListEntry.status} />
            {/if}
            {anilistClient.title(media)}
          </h5>
          <div class='details text-muted m-0 pt-5 text-capitalize d-flex flex-wrap'>
              <span class='badge pl-5 pr-5'>
                {#if media.format}
                  {formatMap[media.format]}
                {/if}
              </span>
            {#if maxEp > 1 || (maxEp !== 1 && ['CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'].includes(media.mediaListEntry?.status) && media.mediaListEntry?.progress)}
                <span class='badge pl-5 pr-5'>
                  {['CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'].includes(media.mediaListEntry?.status) && media.mediaListEntry?.progress ? media.mediaListEntry.progress + ' / ' : ''}{maxEp && maxEp !== 0 && !(media.mediaListEntry?.progress > maxEp) ? maxEp : '?'} Episodes
                </span>
            {:else if media.duration}
                <span class='badge pl-5 pr-5'>
                  {media.duration + ' Minutes'}
                </span>
            {/if}
            {#if media.isAdult}
                <span class='badge pl-5 pr-5'>
                  Rated 18+
                </span>
            {/if}
            {#if media.season || media.seasonYear}
                <span class='badge pl-5 pr-5'>
                  {[media.season?.toLowerCase(), media.seasonYear].filter(s => s).join(' ')}
                </span>
            {/if}
            {#if media.averageScore}
              <span class='badge pl-5 pr-5'>{media.averageScore + '%'} Rating</span>
              {#if media.stats?.scoreDistribution}
                <span class='badge pl-5 pr-5'>{anilistClient.reviews(media)} Reviews</span>
              {/if}
            {/if}
          </div>
          {#if $page === 'schedule'}
            <div class='d-flex align-items-center pt-5 text-white'>
              {#if airingAt(media, _variables)}
                { episode(media, _variables) }&nbsp;
                <span class='font-weight-bold text-white d-inline'>
                  { airingAt(media, _variables) }
                </span>
              {:else}
                &nbsp;
              {/if}
            </div>
          {/if}
        </div>
        {#if media.description}
          <div class='overflow-y-auto px-15 pb-5 bg-very-dark card-desc pre-wrap'>
            {media.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}
          </div>
        {/if}
        {#if media.genres.length}
          <div class='px-15 pb-5 genres' class:pt-10={$page === 'schedule' && SUPPORTS.isAndroid}>
            {#each media.genres.slice(0, 3) as genre}
              <span class='badge badge-color text-dark mt-5 mr-5 font-weight-bold'>{genre}</span>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .title {
    display: -webkit-box !important;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.2;
    overflow: hidden
  }
.pre-wrap {
  white-space: pre-wrap
}
.details {
  font-size: 1.3rem;
}
.details > span:not(:last-child) {
  margin-right: .2rem;
  margin-bottom: .1rem;
}
.card {
  animation: 0.3s ease 0s 1 load-in;
  width: 52rem !important;
  height: 27rem !important;
  box-shadow: rgba(0, 4, 12, 0.3) 0px 7px 15px, rgba(0, 4, 12, 0.05) 0px 4px 4px;
  contain-intrinsic-height: 27rem;
  transition: transform 0.2s ease;
}
.card:hover{
  transform: scale(1.05);
}
.card-grid {
  display: grid;
  grid-template-rows: auto 1fr auto;
}
.badge-color {
  background-color: var(--color) !important;
  border-color: var(--color) !important;
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
