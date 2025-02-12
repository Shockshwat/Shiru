<script>
  import { formatMap, playMedia } from '@/modules/anime.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { settings } from '@/modules/settings.js'
  import { mediaCache } from '@/modules/cache.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { click } from '@/modules/click.js'
  import AudioLabel from '@/views/ViewAnime/AudioLabel.svelte'
  import Scoring from '@/views/ViewAnime/Scoring.svelte'
  import Helper from "@/modules/helper.js"
  import { Heart, Eye } from 'lucide-svelte'
  import { getContext } from 'svelte'

  export let mediaList

  $: current = $mediaCache[mediaList[0]?.id]

  const view = getContext('view')
  function viewMedia () {
    $view = current
  }

  function toggleFavourite () {
    anilistClient.favourite({ id: current.id })
    current.isFavourite = !current.isFavourite
  }

  function currentIndex () {
    return mediaList.indexOf(current)
  }

  function schedule (index) {
    return setTimeout(() => {
      current = $mediaCache[mediaList[index % mediaList.length]?.id]
      timeout = schedule(index + 1)
    }, 15000)
  }

  let timeout = schedule(currentIndex() + 1)

  function setCurrent (media) {
    if (current === $mediaCache[media?.id]) return
    clearTimeout(timeout)
    current = $mediaCache[media?.id]
    timeout = schedule(currentIndex() + 1)
  }
</script>

{#key current}
  <img src={current.bannerImage || (current.trailer?.id ? `https://i.ytimg.com/vi/${current.trailer?.id}/maxresdefault.jpg` : current.coverImage?.extraLarge || ' ')} alt='banner' class='img-cover w-full h-full position-absolute' />
{/key}
<div class='gradient-bottom h-full position-absolute top-0 w-full' />
<div class='gradient-left h-full position-absolute top-0 w-800' />
<div class='pl-20 pb-20 justify-content-end d-flex flex-column h-full banner mw-full'>
  <div class='text-white font-weight-bold font-size-40 title w-800 mw-full overflow-hidden' class:font-size-40={!SUPPORTS.isAndroid} class:font-size-24={SUPPORTS.isAndroid}>
    {anilistClient.title(current)}
  </div>
  <div class='details text-white text-capitalize pt-15 pb-10 d-flex w-600 mw-full'>
    <span class='text-nowrap d-flex align-items-center'>
      {#if current.format}
        {formatMap[current.format]}
      {/if}
    </span>
    {#if current.episodes && current.episodes !== 1}
      <span class='text-nowrap d-flex align-items-center'>
        {#if current.mediaListEntry?.status === 'CURRENT' && current.mediaListEntry?.progress }
          {current.mediaListEntry.progress} / {current.episodes} Episodes
        {:else}
          {current.episodes} Episodes
        {/if}
      </span>
    {:else if current.duration}
      <span class='text-nowrap d-flex align-items-center'>
        {current.duration + ' Minutes'}
      </span>
    {/if}
    {#if settings.value.cardAudio}
      <span class='text-nowrap d-flex align-items-center'>
        <AudioLabel bind:media={current} banner={true} />
      </span>
    {/if}
    {#if current.isAdult}
      <span class='text-nowrap d-flex align-items-center'>
        Rated 18+
      </span>
    {/if}
    {#if current.season || current.seasonYear}
      <span class='text-nowrap d-flex align-items-center'>
        {[current.season?.toLowerCase(), current.seasonYear].filter(s => s).join(' ')}
      </span>
    {/if}
  </div>
  <div class='text-muted description overflow-hidden w-600 mw-full'>
    {current.description?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}
  </div>
  <div class='details text-white text-capitalize pt-15 pb-10 d-flex w-600 mw-full'>
    {#each current.genres as genre}
      <span class='text-nowrap d-flex align-items-center'>
        {genre}
      </span>
    {/each}
  </div>
  <div class='d-flex flex-row pb-10 w-600 mw-full'>
    <button class='btn bg-dark-light px-20 shadow-none border-0 d-flex align-items-center justify-content-center' use:click={() => playMedia(current)}>
      <span>Watch Now</span>
    </button>
    {#if Helper.isAuthorized()}
      <Scoring media={current} />
    {/if}
    {#if Helper.isAniAuth()}
      <button class='btn bg-dark-light btn-square ml-10 d-flex align-items-center justify-content-center shadow-none border-0' use:click={toggleFavourite} disabled={!Helper.isAniAuth()}>
        <Heart fill={current.isFavourite ? 'currentColor' : 'transparent'} size='1.7rem' />
      </button>
    {/if}
    <button class='btn bg-dark-light btn-square ml-10 d-flex align-items-center justify-content-center shadow-none border-0' use:click={viewMedia}>
      <Eye size='1.7rem' />
    </button>
  </div>
  <div class='d-flex'>
    {#each mediaList as media}
      {@const active = current === $mediaCache[media?.id]}
      <div class='pt-10 pb-5 badge-wrapper' class:pointer={!active} use:click={() => setCurrent(media)}>
        <div class='rounded bg-dark-light mr-10 progress-badge overflow-hidden' class:active style='height: 3px;' style:width={active ? '5rem' : '2.7rem'}>
          <div class='progress-content h-full' class:bg-white={active} />
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .gradient-bottom {
    background: var(--banner-gradient-bottom);
  }
  .gradient-left {
    background: var(--banner-gradient-left);
  }
  .progress-badge {
    transition: width .8s ease;
  }
  .progress-badge.active .progress-content {
    animation: fill 15s linear;
  }

  @keyframes fill {
    from {
      width: 0;
    }
    to {
      width: 100%;
    }
  }
  .w-800 {
    width: 80rem
  }
  .details span + span::before {
    content: '•';
    padding: 0 .5rem;
    font-size: .6rem;
    align-self: center;
    white-space: normal;
    color: var(--dm-muted-text-color) !important;
  }
  .description {
    display: -webkit-box !important;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
  }
  .title {
    display: -webkit-box !important;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }
  img, .gradient-bottom, .gradient-left {
    z-index: -1;
  }
  .font-size-40 {
    font-size: 4rem;
  }
  .banner, img {
    animation: fadeIn ease .8s;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  button:hover, .badge-wrapper.pointer:hover .progress-badge {
    background: #292d33 !important;
  }
</style>
