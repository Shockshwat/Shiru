<script context='module'>
  import { animeSchedule } from '@/modules/animeschedule.js'

  let fillerEpisodes = {}

  fetch('https://raw.githubusercontent.com/ThaUnknown/filler-scrape/master/filler.json').then(async res => {
    fillerEpisodes = await res.json()
  })

  async function dubbedEpisode(i, media) {
    const episodeAiring = (await animeSchedule.airingLists.value).find(cached => cached.media.id === media.id)?.media?.airingSchedule?.nodes?.[0]
    return episodeAiring ? episodeAiring.episodeNumber <= (i + 1) ? episodeAiring : Number(episodeAiring.episodeNumber >= (i + 1)) ? 'Dubbed' : null : null
  }
</script>

<script>
  import { since, past } from '@/modules/util.js'
  import { click } from '@/modules/click.js'
  import { episodeByAirDate } from '@/modules/extensions/index.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { liveAnimeProgress } from '@/modules/animeprogress.js'

  export let media

  export let episodeOrder = true

  export let watched = false

  export let episodeCount

  export let userProgress = 0

  export let play

  $: id = media.id

  $: duration = media.duration

  let episodeList = []
  async function load () {
    // updates episodeList when clicking through relations / recommendations
    const res = await fetch('https://api.ani.zip/mappings?anilist_id=' + id)
    const { episodes, specialCount, episodeCount: newEpisodeCount } = await res.json()
    /** @type {{ airingAt: number; episode: number; filler?: boolean; dubAiring?: object; }[]} */
    episodeList = Array.from({ length: (episodeCount || newEpisodeCount) }, (_, i) => ({
      episode: i + 1, image: null, summary: null, rating: null, title: null, length: null, airdate: null, airingAt: null, filler: fillerEpisodes[id]?.includes(i + 1), dubAiring: dubbedEpisode(i, media)
    }))
    let alEpisodes = episodeList
    // fallback: pull episodes from airing schedule if anime doesn't have expected episode count
    if (!(media.episodes && media.episodes === newEpisodeCount && media.status === 'FINISHED')) {
      const settled = (await anilistClient.episodes({ id })).data.Page?.airingSchedules
      if (settled?.length >= newEpisodeCount) {
        alEpisodes = settled.map((episode, i) => ({
          ...episode, airingAt: episode.airingAt, episode: episode.episode, filler: fillerEpisodes[id]?.includes(i + 1), dubAiring: dubbedEpisode(i, media)
        }))
      } else if (settled?.length) {
        const settledMap = settled.reduce((acc, { airingAt, episode }) => {
          acc[episode] = { airingAt, episode }
          return acc
        }, {})
        alEpisodes = alEpisodes.map((episode, i) => {
          const settledData = settledMap?.[episode.episode]
          if (settledData) return { ...episode, airingAt: settledData.airingAt ?? episode.airingAt, episode: settledData.episode ?? episode.episode, filler: fillerEpisodes[id]?.includes(i + 1), dubAiring: dubbedEpisode(i, media)}
          return episode
        })
      }
    }
    for (const { episode, airingAt, filler, dubAiring } of alEpisodes) {
      const alDate = new Date((airingAt || 0) * 1000)
      // validate by air date if the anime has specials AND doesn't have matching episode count
      const needsValidation = !(!specialCount || (media.episodes && media.episodes === newEpisodeCount && episodes && episodes[Number(episode)]))
      const { image, summary, rating, title, length, airdate } = needsValidation ? episodeByAirDate(null, episodes, episode) : ((episodes && episodes[Number(episode)]) || {})

      episodeList[episode - 1] = { episode, image, summary, rating, title, length: length || duration, airdate: +alDate || airdate, airingAt: +alDate || airdate, filler, dubAiring }
    }
  }
  $: if (media) load()

  const animeProgress = liveAnimeProgress(id)
</script>

{#each episodeOrder ? episodeList : [...episodeList].reverse() as { episode, image, summary, rating, title, length, airdate, filler, dubAiring }}
  {@const completed = !watched && userProgress >= episode}
  {@const target = userProgress + 1 === episode}
  {@const progress = !watched && ($animeProgress?.[episode] ?? 0)}
  <div class='w-full my-20 content-visibility-auto scale' class:opacity-half={completed} class:px-20={!target} class:h-150={image || summary}>
    <div class='rounded w-full h-full overflow-hidden d-flex flex-xsm-column flex-row pointer position-relative' class:border={target || filler} class:bg-black={completed} class:border-secondary={filler} class:bg-dark={!completed} use:click={() => play(episode)}>
      {#if image}
        <div class='h-full'>
          <img alt='thumbnail' src={image} class='img-cover h-full' />
        </div>
      {/if}
      {#if filler}
        <div class='position-absolute bottom-0 right-0 bg-secondary py-5 px-10 text-dark rounded-top rounded-left font-weight-bold'>
          Filler
        </div>
      {/if}
      <div class='h-full w-full px-20 py-15 d-flex flex-column'>
        <div class='w-full d-flex flex-row mb-15'>
          <div class='text-white font-weight-bold font-size-16 overflow-hidden title'>
            {episode}. {title?.en || 'Episode ' + episode}
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
          {#await dubAiring then dubAiring}
            {#if dubAiring}
              {@const delayed = dubAiring.episodeDate && new Date(dubAiring.delayedUntil) >= new Date(dubAiring.episodeDate)}
              <div class='position-absolute bottom-0 left-0 {delayed ? `bg-danger` : `bg-secondary`} py-5 px-10 text-dark rounded-top rounded-left font-weight-bold'>
                {#if dubAiring.episodeDate}
                  Dub: {since(past(new Date(delayed ? dubAiring.delayedUntil : dubAiring.episodeDate), (dubAiring.episodeNumber >= episode ? 0 : (episode - dubAiring.episodeNumber)), true))} {delayed ? ' (delayed)' : ''}
                {:else}
                  {dubAiring}
                {/if}
              </div>
            {/if}
          {/await}
        </div>
      </div>
    </div>
  </div>
{/each}

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
    transform: scale(1.05);
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
