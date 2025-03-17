<script>
  import { formatMap, getMediaMaxEp, playMedia } from '@/modules/anime.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { episodesList } from '@/modules/episodes.js'
  import { settings } from '@/modules/settings.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { click } from '@/modules/click.js'
  import Scoring from '@/views/ViewAnime/Scoring.svelte'
  import AudioLabel from '@/views/ViewAnime/AudioLabel.svelte'
  import Helper from '@/modules/helper.js'
  import { Heart, Play, VolumeX, Volume2, ThumbsUp, ThumbsDown } from 'lucide-svelte'

  /** @type {import('@/modules/al.d.ts').Media} */
  export let media
  export let type = null
  export let variables

  $: maxEp = getMediaMaxEp(media)

  let hide = true

  /** @param {import('@/modules/al.d.ts').Media} media */
  function getPlayButtonText (media) {
    if (media.mediaListEntry) {
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
  const playButtonText = getPlayButtonText(media)
  function toggleFavourite() {
    anilistClient.favourite({ id: media.id })
    media.isFavourite = !media.isFavourite
  }
  function play() {
    if (media.status === 'NOT_YET_RELEASED') return
    playMedia(media)
  }
  let muted = true
  function toggleMute() {
    muted = !muted
  }
</script>

<div class='position-absolute w-350 h-400 absolute-container top-0 bottom-0 m-auto bg-dark-light z-30 rounded overflow-hidden pointer'>
  <div class='banner position-relative bg-black overflow-hidden'>
    <object class='img-cover w-full h-full' data={media.bannerImage || (media.trailer?.id && `https://i.ytimg.com/vi/${media.trailer?.id}/maxresdefault.jpg`) || media.coverImage?.extraLarge || ' '}>
      <img class='img-cover w-full h-full' src={(media.trailer?.id && `https://i.ytimg.com/vi/${media.trailer?.id}/hqdefault.jpg`) || ' '} alt='banner'>
    </object>
    {#await (media.trailer?.id && media) || episodesList.getMedia(media.idMal) then trailer}
      {#if trailer?.trailer?.id || trailer?.data?.trailer?.youtube_id }
        <div class='position-absolute z-10 top-0 right-0 m-15 rounded sound' use:click={toggleMute}>
          {#if muted}
            <VolumeX size='2.2rem' fill='currentColor'/>
          {:else}
            <Volume2 size='2.2rem' fill='currentColor'/>
          {/if}
        </div>
        <iframe
          class='w-full border-0 position-absolute left-0'
          class:d-none={hide}
          title={media.title.userPreferred}
          allow='autoplay'
          on:load={() => { hide = false }}
          src={`https://www.youtube.com/embed/${trailer?.trailer?.id || trailer?.data?.trailer?.youtube_id}?autoplay=1&controls=0&mute=${muted ? 1 : 0}&disablekb=1&loop=1&vq=medium&playlist=${trailer?.trailer?.id || trailer?.data?.trailer?.youtube_id}&cc_lang_pref=ja`}
        />
      {/if}
    {/await}
  </div>
  <div class='w-full px-20'>
    <div class='font-size-24 font-weight-bold text-truncate d-inline-block w-full text-white' title={anilistClient.title(media)}>
      {anilistClient.title(media)}
    </div>
    <div class='d-flex flex-row'>
      <button class='btn btn-secondary flex-grow-1 text-dark font-weight-bold shadow-none border-0 d-flex align-items-center justify-content-center' use:click={play} disabled={media.status === 'NOT_YET_RELEASED'}>
        <Play class='pr-10 z-10' fill='currentColor' size='2.2rem'/>
        {playButtonText}
      </button>
      {#if Helper.isAuthorized()}
        <Scoring {media} previewAnime={true}/>
      {/if}
      {#if Helper.isAniAuth()}
        <button class='btn btn-square ml-10 d-flex align-items-center justify-content-center shadow-none border-0'
                use:click={toggleFavourite} disabled={!Helper.isAniAuth()}>
          <Heart fill={media.isFavourite ? 'currentColor' : 'transparent'} size='1.7rem'/>
        </button>
      {/if}
    </div>
    <div class='text-truncate pb-10'>
      <div class='details text-white text-capitalize pt-10 d-flex flex-wrap'>
        {#if type || type === 0}
          <span class='d-flex badge pl-5 pr-5 d-flex align-items-center justify-content-center' class:font-size-14={!SUPPORTS.isAndroid} class:font-size-12={SUPPORTS.isAndroid}>
            {#if Number.isInteger(type) && type >= 0}
              <ThumbsUp fill='currentColor' class='m-0 p-0 pr-5 {type === 0 ? "text-muted" : "text-success"}' size='1.9rem'/>
            {:else if Number.isInteger(type) && type < 0}
              <ThumbsDown fill='currentColor' class='text-danger m-0 p-0 pr-5' size='1.9rem'/>
            {/if}
            <span> {(Number.isInteger(type) ? Math.abs(type).toLocaleString() + (type >= 0 ? ' likes' : ' dislikes') : type)}</span>
          </span>
        {/if}
        <span class='badge pl-5 pr-5' class:font-size-14={!SUPPORTS.isAndroid} class:font-size-12={SUPPORTS.isAndroid}>
          {#if media.format}
            {formatMap[media.format]}
          {/if}
        </span>
        {#if !variables?.scheduleList && settings.value.cardAudio}
          <span class='badge pl-5 pr-5' class:font-size-14={!SUPPORTS.isAndroid} class:font-size-12={SUPPORTS.isAndroid}>
            <AudioLabel {media} banner={true}/>
          </span>
        {/if}
        {#if maxEp > 1 || (maxEp !== 1 && ['CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'].includes(media.mediaListEntry?.status) && media.mediaListEntry?.progress)}
          <span class='badge pl-5 pr-5' class:font-size-14={!SUPPORTS.isAndroid} class:font-size-12={SUPPORTS.isAndroid}>
            {['CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'].includes(media.mediaListEntry?.status) && media.mediaListEntry?.progress ? media.mediaListEntry.progress + ' / ' : ''}{maxEp && maxEp !== 0 && !(media.mediaListEntry?.progress > maxEp) ? maxEp : '?'}
            Episodes
          </span>
        {:else if media.duration}
          <span class='badge pl-5 pr-5' class:font-size-14={!SUPPORTS.isAndroid} class:font-size-12={SUPPORTS.isAndroid}>
            {media.duration + ' Minutes'}
          </span>
        {/if}
        {#if media.isAdult}
        <span class='badge pl-5 pr-5' class:font-size-14={!SUPPORTS.isAndroid} class:font-size-12={SUPPORTS.isAndroid}>
            Rated 18+
          </span>
        {/if}
        {#if media.season || media.seasonYear}
          <span class='badge pl-5 pr-5' class:font-size-14={!SUPPORTS.isAndroid} class:font-size-12={SUPPORTS.isAndroid}>
            {[media.season?.toLowerCase(), media.seasonYear].filter(s => s).join(' ')}
          </span>
        {/if}
        {#if media.averageScore}
          <span class='badge pl-5 pr-5' class:font-size-14={!SUPPORTS.isAndroid}
                class:font-size-12={SUPPORTS.isAndroid}>{media.averageScore + '%'} Rating</span>
          {#if media.stats?.scoreDistribution && (!type && type !== 0)}
            <span class='badge pl-5 pr-5' class:font-size-14={!SUPPORTS.isAndroid}
                  class:font-size-12={SUPPORTS.isAndroid}>{anilistClient.reviews(media)} Reviews</span>
          {/if}
        {/if}
      </div>
    </div>
    {#if media.description}
      <div class='w-full h-full text-muted description overflow-hidden' class:font-size-14={!SUPPORTS.isAndroid}
           class:font-size-12={SUPPORTS.isAndroid} class:line-clamp-3={!SUPPORTS.isAndroid}
           class:line-clamp-2={SUPPORTS.isAndroid}>
        {media.description?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}
      </div>
    {/if}
  </div>
</div>

<style>
  .description {
    display: -webkit-box !important;
    -webkit-box-orient: vertical;
  }
  .line-clamp-2 {
    -webkit-line-clamp: 2;
  }
  .line-clamp-3 {
    -webkit-line-clamp: 3;
  }
  .banner {
    height: 45%
  }
  .sound {
    filter: drop-shadow(0 0 .4rem rgba(0, 0, 0, 1))
  }
  .details > span:not(:last-child) {
    margin-right: .2rem;
    margin-bottom: .1rem;
  }
  .banner::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    margin-bottom: -1px;
    width: 100%;
    height: 100%;
    background: var(--preview-card-gradient);
  }
  @keyframes load-in {
    from {
      bottom: -1.2rem;
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      bottom: 0;
      opacity: 1;
      transform: scale(1);
    }
  }
  .absolute-container {
    animation: 0.3s ease 0s 1 load-in;
    left: -100%;
    right: -100%;
  }
  @keyframes delayedShow {
    to {
      visibility: visible;
    }
  }
  iframe {
    height: 200%;
    top: 50%;
    transform: translate(0, -50%);
    visibility: hidden;
    animation: 0s linear 0.5s forwards delayedShow;
  }
</style>
