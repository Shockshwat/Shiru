<script>
  import { getContext, onMount } from 'svelte'
  import { getMediaMaxEp, formatMap, playMedia, genreIcons } from '@/modules/anime.js'
  import { playAnime } from '@/views/TorrentSearch/TorrentModal.svelte'
  import { settings } from '@/modules/settings.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { add } from '@/modules/torrent.js'
  import { toast } from 'svelte-sonner'
  import { anilistClient } from '@/modules/anilist.js'
  import { click } from '@/modules/click.js'
  import Details from '@/views/ViewAnime/Details.svelte'
  import EpisodeList from '@/views/ViewAnime/EpisodeList.svelte'
  import ToggleList from '@/views/ViewAnime/ToggleList.svelte'
  import Scoring from '@/views/ViewAnime/Scoring.svelte'
  import AudioLabel from '@/views/ViewAnime/AudioLabel.svelte'
  import Following from '@/views/ViewAnime/Following.svelte'
  import smoothScroll from '@/modules/scroll.js'
  import IPC from '@/modules/ipc.js'
  import SmallCard from '@/components/cards/SmallCard.svelte'
  import SkeletonCard from '@/components/cards/SkeletonCard.svelte'
  import Helper from '@/modules/helper.js'
  import { ArrowLeft, Clapperboard, ExternalLink, Users, Heart, Play, Share2, Timer, TrendingUp, Tv, Hash, ArrowDownZA, ArrowUpZA } from 'lucide-svelte'

  export let overlay
  const view = getContext('view')
  function close () {
    $view = null
    mediaList = []
    overlay = overlay.filter(item => item !== 'viewanime')
  }
  function back () {
    if (mediaList.length > 1) {
      const prevMedia = mediaList[mediaList.length - 2]
      mediaList.splice(mediaList.length - 2, 2)
      $view = prevMedia
    }
  }
  function saveMedia () {
    if (mediaList.length > 0) {
      const lastMedia = mediaList[mediaList.length - 1]
      if (media !== lastMedia) {
        mediaList.push(media)
      }
    } else {
      mediaList.push(media)
    }
  }
  let modal
  let container = null
  let scrollTags = null
  let scrollGenres = null
  let mediaList = []
  let mediaCache
  let mediaId
  anilistClient.mediaCache.subscribe(value => mediaCache = value)
  $: media = mediaCache[$view?.id] || $view
  $: mediaId = media?.id
  $: watched = media?.mediaListEntry?.status === 'COMPLETED'
  $: userProgress =  ['CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'].includes(media?.mediaListEntry?.status) && media?.mediaListEntry?.progress
  $: recommendations = media && anilistClient.recommendations({ id: media.id })
  $: searchIDS = media && (async () => {
    const searchIDS = [...(media.relations?.edges?.filter(({ node }) => node.type === 'ANIME').map(({ node }) => node.id) || []), ...((await recommendations)?.data?.Media?.recommendations?.edges?.map(({ node }) => node.mediaRecommendation?.id) || [])]
    return searchIDS.length > 0 ? anilistClient.searchAllIDS({ page: 1, perPage: 50, id: searchIDS }) : Promise.resolve([])
  })()
  $: mediaId && (modal?.focus(), overlay = [...overlay, 'viewanime'], saveMedia(), (container && scrollTop()))
  $: !mediaId && close()
  $: {
    if (media) {
      if (scrollTags) scrollTags.scrollLeft = 0
      if (scrollGenres) scrollGenres.scrollLeft = 0
    }
  }
  function scrollTop() {
    container.dispatchEvent(new Event('scrolltop'))
    if (!settings.value.smoothScroll) container.scrollTo({top: 0, behavior: 'smooth'})
  }
  function checkClose ({ keyCode }) {
    if (keyCode === 27) close()
  }
  function play (episode) {
    if (episode || episode === 0) return playAnime(media, episode)
    if (media.status === 'NOT_YET_RELEASED') return
    playMedia(media)
  }
  function getPlayButtonText (media) {
    if (media?.mediaListEntry) {
      const { status, progress } = media.mediaListEntry
      if (progress) {
        if (status === 'COMPLETED') {
          return 'Rewatch Now'
        } else {
          return 'Continue Now'
        }
      }
    }
    return 'Watch Now'
  }
  $: playButtonText = getPlayButtonText(media)
  function toggleFavourite () {
    anilistClient.favourite({ id: media.id })
    media.isFavourite = !media.isFavourite
  }
  function copyToClipboard (text) {
    navigator.clipboard.writeText(text)
    toast('Copied to clipboard', {
      description: 'Copied share URL to clipboard',
      duration: 5000
    })
  }
  function openInBrowser (url) {
    IPC.emit('open', url)
  }
  let episodeOrder = true
  window.addEventListener('overlay-check', (event) => { if (!event?.detail?.nowPlaying && media) close() })

  function handlePlay(id, episode, torrentOnly) {
    const mediaCache = anilistClient.mediaCache.value[id]
    const cachedEpisode = episode || mediaCache?.mediaListEntry?.progress
    const desiredEpisode = (episode ? episode : cachedEpisode && cachedEpisode !== 0 ? cachedEpisode + 1 : cachedEpisode)
    if (torrentOnly) {
      if (desiredEpisode) return playAnime(mediaCache, desiredEpisode)
      if (mediaCache?.status === 'NOT_YET_RELEASED') return
      playMedia(mediaCache)
    } else {
      $view = mediaCache
      setTimeout(() => {
        play(desiredEpisode)
        IPC.emit('overlay-check')
      }, 500)
    }
  }

  IPC.on('play-anime', (id, episode, torrentOnly) => {
    handlePlay(id, episode, torrentOnly)
  })

  window.addEventListener('play-anime', (event) => {
    const { id, episode, torrentOnly } = event.detail
    handlePlay(id, episode, torrentOnly)
  })

  window.addEventListener('play-torrent', (event) => {
    add(event.detail.magnet)
    IPC.emit('overlay-check')
  })

  IPC.on('play-torrent', magnet => {
    add(magnet)
    IPC.emit('overlay-check')
  })

  let episodeList = []
  let episodeLoad
  $: if (episodeLoad) {
    episodeLoad.then(episodes => {
      episodeList = episodes
    })
  }

  let leftColumn, rightColumn
  function episodeHeight() {
    if (leftColumn && rightColumn) {
      const leftHeight = leftColumn.offsetHeight
      if (rightColumn.style.height !== `${leftHeight}px`) {
        rightColumn.style.height = `${leftHeight}px`
      }
    }
  }

  onMount(() => {
    setInterval(() => episodeHeight(), 500)
    window.addEventListener('resize', episodeHeight)
  })
</script>

<div class='modal modal-full z-50' class:show={media} on:keydown={checkClose} tabindex='-1' role='button' bind:this={modal}>
  <div class='h-full modal-content bg-very-dark p-0 overflow-y-auto position-relative' bind:this={container} use:smoothScroll={{ prevent: 'episode-list' }}>
    {#if media}
      {#if mediaList.length > 1}
        <button class='close back pointer z-30 bg-dark top-20 left-0 position-fixed' use:click={back}>
          <ArrowLeft size='1.8rem' />
        </button>
      {/if}
      <button class='close pointer z-30 bg-dark top-20 right-0 position-fixed' type='button' use:click={() => close()}> &times; </button>
      <img class='w-full cover-img banner position-absolute' alt='banner' src={media.bannerImage || ' '} />
      <div class='row px-20'>
        <div class='col-lg-7 col-12 pb-10'>
          <div bind:this={leftColumn}>
            <div class='d-flex flex-sm-row flex-column align-items-sm-end pb-20 mb-15'>
              <div class='cover d-flex flex-row align-items-sm-end align-items-center justify-content-center mw-full mb-sm-0 mb-20 w-full' style='max-height: 50vh;'>
                <img class='rounded cover-img overflow-hidden h-full' alt='cover-art' src={media.coverImage?.extraLarge || media.coverImage?.medium} />
              </div>
              <div class='pl-sm-20 ml-sm-20'>
                <h1 class='font-weight-very-bold text-white select-all mb-0' class:font-size-24={SUPPORTS.isAndroid}>{anilistClient.title(media)}</h1>
                <div class='d-flex flex-row font-size-18 flex-wrap mt-5'>
                  {#if media.averageScore}
                    <div class='d-flex flex-row mt-10' title='{media.averageScore / 10} by {anilistClient.reviews(media)} reviews'>
                      <TrendingUp class='mx-10' size='2.2rem' />
                      <span class='mr-20'>
                        Rating: {media.averageScore + '%'}
                      </span>
                    </div>
                  {/if}
                  {#if media.format}
                    <div class='d-flex flex-row mt-10'>
                      <Tv class='mx-10' size='2.2rem' />
                      <span class='mr-20 text-capitalize'>
                        Format: {formatMap[media.format]}
                      </span>
                    </div>
                  {/if}
                  {#if media.episodes !== 1}
                    {@const maxEp = getMediaMaxEp(media)}
                    <div class='d-flex flex-row mt-10'>
                      <Clapperboard class='mx-10' size='2.2rem' />
                      <span class='mr-20'>
                      Episodes: {maxEp && maxEp !== 0 ? maxEp : '?'}
                      </span>
                    </div>
                  {:else if media.duration}
                    <div class='d-flex flex-row mt-10'>
                      <Timer class='mx-10' size='2.2rem' />
                      <span class='mr-20'>
                        Length: {media.duration + ' min'}
                      </span>
                    </div>
                  {/if}
                  {#if media.averageScore && media.stats?.scoreDistribution}
                    <div class='d-flex flex-row mt-10'>
                      <Users class='mx-10' size='2.2rem' />
                      <span class='mr-20' title='{media.averageScore / 10} by {anilistClient.reviews(media)} reviews'>
                        Reviews: {anilistClient.reviews(media)}
                      </span>
                    </div>
                  {/if}
                  <div class='d-flex flex-row mt-10'>
                    <AudioLabel {media} viewAnime={true}/>
                  </div>
                </div>
                <div class='d-flex flex-row flex-wrap play'>
                  <button class='btn btn-lg btn-secondary w-250 text-dark font-weight-bold shadow-none border-0 d-flex align-items-center justify-content-center mr-10 mt-20'
                          use:click={() => play()}
                          disabled={media.status === 'NOT_YET_RELEASED'}>
                    <Play class='mr-10' fill='currentColor' size='1.6rem' />
                    {playButtonText}
                  </button>
                  <div class='mt-20 d-flex'>
                    {#if Helper.isAuthorized()}
                      <Scoring {media} viewAnime={true} />
                    {/if}
                    {#if Helper.isAniAuth()}
                      <button class='btn bg-dark btn-lg btn-square d-flex align-items-center justify-content-center shadow-none border-0 ml-10' use:click={toggleFavourite} disabled={!Helper.isAniAuth()}>
                        <Heart fill={media.isFavourite ? 'currentColor' : 'transparent'} size='1.7rem' />
                      </button>
                    {/if}
                    <button class='btn bg-dark btn-lg btn-square d-flex align-items-center justify-content-center shadow-none border-0' class:ml-10={Helper.isAuthorized()} use:click={() => copyToClipboard(Helper.isAniAuth() || !media.idMal ? `https://anilist.co/anime/${media.id}` : `https://myanimelist.net/anime/${media.idMal}`)}>
                      <Share2 size='1.7rem' />
                    </button>
                    <button class='btn bg-dark btn-lg btn-square d-flex align-items-center justify-content-center shadow-none border-0 ml-10' use:click={() => openInBrowser(Helper.isAniAuth() || !media.idMal ? `https://anilist.co/anime/${media.id}` : `https://myanimelist.net/anime/${media.idMal}`)}>
                      <ExternalLink size='1.7rem' />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <Details {media} alt={recommendations} />
            <div bind:this={scrollTags} class='m-0 px-20 pb-0 pt-10 d-flex flex-row text-nowrap overflow-x-scroll text-capitalize align-items-start'>
              {#each media.tags as tag}
                <div class='bg-dark px-20 py-10 mr-10 rounded text-nowrap d-flex align-items-center select-all'>
                  <Hash class='mr-5' size='1.8rem' /><span class='font-weight-bolder'>{tag.name}</span><span class='font-weight-light'>: {tag.rank}%</span>
                </div>
              {/each}
            </div>
            <div bind:this={scrollGenres} class='m-0 px-20 pb-0 pt-10 d-flex flex-row text-nowrap overflow-x-scroll text-capitalize align-items-start'>
              {#each media.genres as genre}
                <div class='bg-dark px-20 py-10 mr-10 rounded text-nowrap d-flex align-items-center select-all'><svelte:component this={genreIcons[genre]} class='mr-5' size='1.8rem' /> {genre}</div> <!-- || Drama-->
              {/each}
            </div>
            {#if media.description}
              <div class='w-full d-flex flex-row align-items-center pt-20 mt-10'>
                <hr class='w-full' />
                <div class='font-size-18 font-weight-semi-bold px-20 text-white'>Synopsis</div>
                <hr class='w-full' />
              </div>
              <div class='font-size-16 pre-wrap pt-20 select-all'>
                {media.description?.replace(/<[^>]*>/g, '') || ''}
              </div>
            {/if}
            <Following {media} />
            {#if episodeList}
              <div class='w-full d-flex d-lg-none flex-row align-items-center pt-20 mt-10 pointer' use:click={() => { episodeOrder = !episodeOrder }}>
                <hr class='w-full' />
                <div class='position-absolute font-size-18 font-weight-semi-bold px-20 text-white' style='left: 50%; transform: translateX(-50%);'>Episodes</div>
                <hr class='w-full' />
                <div class='ml-auto pl-20 font-size-12 more text-muted text-nowrap'>Reverse</div>
              </div>
            {/if}
            <div class='col-lg-5 col-12 d-flex d-lg-none flex-column pl-lg-20 overflow-x-hidden h-600 mt-20'>
              <EpisodeList bind:episodeList={episodeList} mobileList={true} {media} {episodeOrder} bind:userProgress bind:watched episodeCount={getMediaMaxEp(media)} {play} />
            </div>
            <ToggleList list={ media.relations?.edges?.filter(({ node }) => node.type === 'ANIME').sort((a, b) => {
                  const typeComparison = a.relationType.localeCompare(b.relationType)
                  if (typeComparison !== 0) return typeComparison
                  return (a.node.seasonYear || 0) - (b.node.seasonYear || 0)
                }) } promise={searchIDS} let:item let:promise title='Relations'>
              <div class='small-card'>
                {#await promise}
                  <SkeletonCard />
                {:then res }
                  {#if res}
                    {#if anilistClient.mediaCache.value[item.node.id]} <!-- sometimes anilist query just doesn't return the requested ids -->
                      <SmallCard media={anilistClient.mediaCache.value[item.node.id]} type={item.relationType.replace(/_/g, ' ').toLowerCase()} />
                    {/if}
                  {/if}
                {/await}
              </div>
            </ToggleList>
            {#await recommendations then res}
              {@const media = res?.data?.Media}
              {#if media}
                <ToggleList list={ media.recommendations?.edges?.filter(({ node }) => node.mediaRecommendation).sort((a, b) => b.node.rating - a.node.rating) } promise={searchIDS} let:item let:promise title='Recommendations'>
                  <div class='small-card'>
                    {#await promise}
                      <SkeletonCard />
                    {:then res}
                      {#if res}
                        {#if anilistClient.mediaCache.value[item.node.mediaRecommendation.id]} <!-- sometimes anilist query just doesn't return the requested ids -->
                          <SmallCard media={anilistClient.mediaCache.value[item.node.mediaRecommendation.id]} type={item.node.rating} />
                        {/if}
                      {/if}
                    {/await}
                  </div>
                </ToggleList>
              {/if}
            {/await}
          </div>
        </div>
        <div class='col-lg-5 col-12 d-none d-lg-flex flex-column pl-lg-20' bind:this={rightColumn}>
          <button class='close order pointer z-30 bg-dark position-absolute' use:click={()=> {episodeOrder = !episodeOrder}}>
            <svelte:component this={episodeOrder ? ArrowDownZA : ArrowUpZA} size='2rem' />
          </button>
          <EpisodeList bind:episodeLoad={episodeLoad} {media} {episodeOrder} bind:userProgress bind:watched episodeCount={getMediaMaxEp(media)} {play} />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .close {
    top: 5rem !important;
    left: unset !important;
    right: 3rem !important;
  }
  .back {
    top: 5rem !important;
    left: 2.5rem !important;
    right: unset !important;
  }
  .order {
    top: 7rem !important;
    left: -5rem !important;
  }
  .banner {
    opacity: 0.5;
    z-index: 0;
    aspect-ratio: 5/1;
    min-height: 20rem;
  }
  .play {
    justify-content: center;
  }
  @media (min-width: 577px) {
    .cover {
      max-width: 35% !important;
    }
    .play {
      justify-content: left;
    }
  }
  .row {
    padding-top: 12rem !important
  }
  @media (min-width: 769px) {
    .back {
      left: 9rem !important;
    }
    .row  {
      padding: 0 10rem;
    }
  }
  .cover {
    aspect-ratio: 7/10;
  }
  .small-card {
    width: 23rem !important;
  }

  button.bg-dark:not([disabled]):hover {
    background: #292d33 !important;
  }
</style>
