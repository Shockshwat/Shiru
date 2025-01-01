<script context='module'>
  import { animeSchedule } from '@/modules/animeschedule.js'
  import { malDubs } from '@/modules/animedubs.js'
  import { past } from '@/modules/util.js'

  async function dubbedEpisode(i, media) {
    const episode = i + 1
    const entry = (await animeSchedule.dubAiringLists.value).find(entry => entry.media?.media?.id === media.id)
    const episodeEntry = (await animeSchedule.dubAiredLists.value).find(entry => entry?.id === media.id && entry?.episode?.aired === episode)
    if (entry && !episodeEntry) {
      const airingSchedule = entry?.media?.media?.airingSchedule?.nodes[episode - 1] || entry?.airingSchedule?.media?.media?.nodes[0]
      const delayed = !!(entry.episodeDate && (((new Date(entry.delayedUntil) >= new Date(entry.episodeDate)) && (new Date(entry.delayedUntil) > new Date())) || entry.delayedIndefinitely))
      if (entry.episodeDate && (entry.episodeNumber <= episode)) {
        return { text: `Dub: ${entry.delayedIndefinitely && !entry.status?.toUpperCase()?.includes('FINISHED') ? 'Suspended' : entry.delayedIndefinitely ? 'Not Planned' : since(past(new Date(delayed ? entry.delayedUntil : entry.episodeDate), entry.episodeNumber >= episode ? 0 : episode - entry.episodeNumber, true)) + (delayed ? ` (${entry.delayedText || 'Delayed'})` : '')}`, delayed: delayed }
      } else if (airingSchedule && airingSchedule.episode <= episode) {
        return { text: `Dub: ${since(new Date(airingSchedule.airingAt))}`, delayed: delayed && !entry.delayedIndefinitely }
      } else {
        return { text: `Dubbed`, delayed: false }
      }
    } else if (episodeEntry) {
      return { text: `Dub: ${since(new Date(episodeEntry.episode.airedAt))}`, delayed: false }
    } else if (malDubs.dubLists.value.incomplete.includes(media.idMal) && (await animeSchedule.dubAiredLists.value).find(entry => entry?.id === media.id && entry?.episode?.aired === 1)) {
      return { text: `Dub: Not Planned`, delayed: true }
    }
  }
</script>

<script>
  import { since } from '@/modules/util.js'
  import { click } from '@/modules/click.js'
  import { afterUpdate, onDestroy } from 'svelte'
  import { episodeByAirDate } from '@/modules/extensions/index.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { liveAnimeProgress } from '@/modules/animeprogress.js'
  import { episodesList } from '@/modules/episodes.js'
  import { getAniMappings } from '@/modules/anime.js'
  import smoothScroll from '@/modules/scroll.js'
  import EpisodeSkeletonCard from '@/views/ViewAnime/EpisodeListSkeleton.svelte'

  export let media

  export let episodeOrder = true

  export let watched = false

  export let episodeCount

  export let userProgress = 0

  export let play

  export let episodeLoad = null

  export let mobileList = false

  export let episodeList = []

  let mobileWaiting = null

  $: id = media.id
  $: idMal = media.idMal
  $: duration = media.duration

  const episodeRx = /Episode (\d+) - (.*)/

  async function load () {
    // updates episodeList when clicking through relations / recommendations
    const { episodes, specialCount, episodeCount: newEpisodeCount } = await getAniMappings(id)

    /** @type {{ airingAt: number; episode: number; filler?: boolean; dubAiring?: object; }[]} */
    episodeList = Array.from({ length: ((await episodeCount) || newEpisodeCount) }, (_, i) => ({
      episode: i + 1, image: null, summary: null, rating: null, title: null, length: null, airdate: null, airingAt: null, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)
    }))
    let alEpisodes = episodeList
    // fallback: pull episodes from airing schedule if anime doesn't have expected episode count

    if (!(media.episodes && media.episodes === newEpisodeCount && media.status === 'FINISHED')) {
      const settled = (await anilistClient.episodes({ id })).data.Page?.airingSchedules
      if (settled?.length >= newEpisodeCount) {
        alEpisodes = settled.map((episode, i) => ({
          ...episode, airingAt: episode.airingAt, episode: episode.episode, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)
        }))
      } else if (settled?.length) {
        const settledMap = settled.reduce((acc, { airingAt, episode }) => {
          acc[episode] = { airingAt, episode }
          return acc
        }, {})
        alEpisodes = alEpisodes.map((episode, i) => {
          const settledData = settledMap?.[episode.episode]
          if (settledData) return { ...episode, airingAt: settledData.airingAt ?? episode.airingAt, episode: settledData.episode ?? episode.episode, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)}
          return episode
        })
      }
    }

    if ((alEpisodes.length < (await episodeCount)) && !newEpisodeCount) {
      const eps = await episodesList.getEpisodeData(idMal)
      if (eps?.length > 0) {
        const lastId = eps[eps.length - 1].episode_id
        alEpisodes = Array.from({ length: (lastId) }, (_, i) => ({
          episode: i + 1, image: null, summary: null, rating: null, title: (lastId <= 100 ? eps.find(e => e.episode_id === (i + 1)) : episodesList.getSingleEpisode(idMal, (i + 1)))?.title, length: null, airdate: null, airingAt: (lastId <= 100 ? eps.find(e => e.episode_id === (i + 1)) : episodesList.getSingleEpisode(idMal, (i + 1)))?.aired, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)
        }))
      } else if ((media?.status === 'RELEASING' || media?.status === 'FINISHED')) {
        alEpisodes = Array.from({ length: (media?.mediaListEntry?.progress > 0 ? media?.mediaListEntry?.progress : 1) }, (_, i) => ({
          episode: i + 1, image: null, summary: null, rating: null, title: null, length: null, airdate: null, airingAt: null, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)
        }))
      }
    }

    for (const { episode, title: oldTitle, airingAt, filler, dubAiring } of alEpisodes) {
      const airingPromise = await airingAt
      const alDate = new Date(typeof airingPromise === 'number' ? (airingPromise || 0) * 1000 : (airingPromise || 0))
      // validate by air date if the anime has specials AND doesn't have matching episode count
      const needsValidation = !(!specialCount || (media.episodes && media.episodes === newEpisodeCount && episodes && episodes[Number(episode)]))
      const { image, summary, rating, title: newTitle, length, airdate } = needsValidation ? episodeByAirDate(null, episodes, episode) : ((episodes && episodes[Number(episode)]) || {})
      const streamingTitle = !media.streamingEpisodes?.find(ep => episodeRx.exec(ep.title) && Number(episodeRx.exec(ep.title)[1]) === (media?.episodes + 1)) && media.streamingEpisodes?.find(ep => episodeRx.exec(ep.title) && Number(episodeRx.exec(ep.title)[1]) === episode && episodeRx.exec(ep.title)[2] && !episodeRx.exec(ep.title)[2].toLowerCase().trim().startsWith('episode'))
      const title = episodeRx.exec(streamingTitle?.title)?.[2] || newTitle?.en || oldTitle?.en || (await episodesList.getSingleEpisode(idMal, episode))?.title

      episodeList[episode - 1] = { episode, image, summary, rating, title, length: length || duration, airdate: +alDate || airdate, airingAt: +alDate || airdate, filler, dubAiring }
    }

    currentEpisodes = episodeList?.slice(0, maxEpisodes)
    return episodeList && episodeList?.length > 0 ? episodeList : null
  }

  $: if (media) {
    episodeList = []
    episodeOrder = true
    currentEpisodes = []
    mobileWaiting = null
    if (!mobileList) episodeLoad = load()
  }

  $: {
    if (episodeOrder) currentEpisodes = episodeList?.slice(0, maxEpisodes)
    else currentEpisodes = [...episodeList]?.reverse()?.slice(0, maxEpisodes)
  }

  function mobileWait(condition, interval = 1000) {
    if (mobileWaiting) return mobileList ? mobileWaiting : null
    mobileWaiting = new Promise(resolve => setTimeout(resolve, 1000))
    mobileWaiting = new Promise((resolve) => {
      const check = () => {
        if (mobileWaiting) {
          if (condition()) resolve()
          else setTimeout(check, interval)
        }
      }
      check()
    })
    return mobileWaiting
  }

  const animeProgress = liveAnimeProgress(id)

  let maxEpisodes = 100
  let currentEpisodes = []
  let container
  function handleScroll() {
    if (!container) return;
    if (currentEpisodes.length !== episodeList.length && container.scrollTop + container.clientHeight + 80 >= container.scrollHeight) {
      const nextBatch = episodeList.slice(currentEpisodes.length, currentEpisodes.length + maxEpisodes)
      currentEpisodes = [...new Set([...currentEpisodes, ...nextBatch])]
    }
  }

  onDestroy(() => {
    mobileWaiting = null
    episodeList = []
    episodeLoad = null
  })
</script>

<div bind:this={container} class='episode-list overflow-y-auto overflow-x-hidden' use:smoothScroll on:scroll={handleScroll}>
  {#await (episodeLoad || mobileWait(() => episodeList?.length > 0 || !episodeList)?.then(() => episodeList))}
    {#each Array.from({ length: Math.max(Math.min(episodeCount || 0, maxEpisodes), 1) }) as _}
      <div class='w-full px-20 my-20 content-visibility-auto scale h-150'>
        <EpisodeSkeletonCard />
      </div>
    {/each}
  {:then _}
    {#if episodeList}
      {#each currentEpisodes as { episode, image, summary, rating, title, length, airdate, filler, dubAiring }, index}
        {#await Promise.all([title, filler, dubAiring])}
          {#each Array.from({ length: Math.min(episodeCount || 0, maxEpisodes) }) as _, index}
            <div class='w-full px-20 content-visibility-auto scale h-150' class:my-20={!mobileList || index !== 0}>
              <EpisodeSkeletonCard />
            </div>
          {/each}
        {:then [title, filler, dubAiring]}
          {@const completed = !watched && userProgress >= episode}
          {@const target = userProgress + 1 === episode}
          {@const hasFiller = filler?.filler || filler?.recap}
          {@const progress = !watched && ($animeProgress?.[episode] ?? 0)}
          <div class='w-full content-visibility-auto scale' class:my-20={!mobileList || index !== 0} class:opacity-half={completed} class:scale-target={target} class:px-20={!target} class:px-10={target} class:h-150={image || summary}>
            <div class='rounded w-full h-full overflow-hidden d-flex flex-xsm-column flex-row pointer position-relative' class:border={target || hasFiller} class:bg-black={completed} class:border-secondary={hasFiller} class:bg-dark={!completed} use:click={() => play(episode)}>
              {#if image}
                <div class='h-full'>
                  <img alt='thumbnail' src={image} class='img-cover h-full' />
                </div>
              {/if}
              {#if hasFiller}
                <div class='position-absolute bottom-0 right-0 bg-secondary py-5 px-10 text-dark rounded-top rounded-left font-weight-bold'>
                  {filler?.filler ? 'Filler' : 'Recap'}
                </div>
              {/if}
              <div class='h-full w-full px-20 py-15 d-flex flex-column'>
                <div class='w-full d-flex flex-row mb-15'>
                  <div class='text-white font-weight-bold font-size-16 overflow-hidden title'>
                    {episode}. {title || 'Episode ' + episode}
                  </div>
                  {#if length}
                    <div class='ml-auto pl-5'>
                      {length}m
                    </div>
                  {/if}
                </div>
                {#if completed}
                  <div class='progress mb-15' style='height: 2px; min-height: 2px;'>
                    <div class='progress-bar w-full' />
                  </div>
                {:else if progress}
                  <div class='progress mb-15' style='height: 2px; min-height: 2px;'>
                    <div class='progress-bar' style='width: {progress}%' />
                  </div>
                {/if}
                <div class='font-size-12 overflow-hidden'>
                  {summary || ''}
                </div>
                <div class='pt-10 font-size-12 mt-auto'>
                  {#if airdate}
                    {since(new Date(airdate))}
                  {/if}
                </div>
                <div class='pt-20 font-size-12 mt-auto'>
                  {#if dubAiring}
                    <div class='position-absolute bottom-0 left-0 {dubAiring.delayed ? `bg-danger` : `bg-secondary`} py-5 px-10 text-dark rounded-top rounded-left font-weight-bold'>
                      {dubAiring.text}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/await}
      {/each}
    {/if}
  {/await}
</div>

<style>
  .opacity-half {
    opacity: 30%;
  }
  .title {
    display: -webkit-box !important;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }
  .scale {
    transition: transform 0.2s ease;
  }
  .scale:hover{
    transform: scale(1.04);
  }
  .scale-target:hover{
    transform: scale(1.02) !important;
  }
  .border {
    --dm-border-color: white
  }
  @media (max-width: 470px) {
    .flex-xsm-column {
      flex-direction: column !important;
    }
    .scale {
      height: auto !important;
    }
    img {
      width: 100%;
      height: 15rem !important;
    }
  }
</style>
