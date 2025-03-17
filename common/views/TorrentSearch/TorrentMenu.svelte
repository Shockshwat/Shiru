<script context='module'>
  import { toast } from 'svelte-sonner'
  import { settings } from '@/modules/settings.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { sanitiseTerms } from './TorrentCard.svelte'
  import { click } from '@/modules/click.js'
  import { X } from 'lucide-svelte'
  import getResultsFromExtensions from '@/modules/extensions/index.js'
  import Debug from 'debug'

  const debug = Debug('ui:extensions')

  /** @typedef {import('@/modules/al.d.ts').Media} Media */
  /** @typedef {import('anitomyscript').AnitomyResult} AnitomyResult */

  /** @param {Media} media */
  function isMovie (media) {
    if (media.format === 'MOVIE') return true
    if ([...Object.values(media.title), ...media.synonyms].some(title => title?.toLowerCase().includes('movie'))) return true
    // if (!getParentForSpecial(media)) return true // TODO: this is good for checking movies, but false positives with normal TV shows
    return media.duration > 80 && media.episodes === 1
  }

  /** @param {AnitomyResult} result
   * @param {string} audioLang
   */
  function getRequestedAudio(result, audioLang) {
    const terms = sanitiseTerms(result)
    const checkTerm = (term, keyword) => (Array.isArray(term.text) ? term.text : [term.text]).some(text => text.toLowerCase().includes(keyword.toLowerCase()))

    const exactMatch = terms.some(term => checkTerm(term, audioLang))
    const dualAudio = terms.some(term => checkTerm(term, 'dual'))

    return exactMatch || dualAudio
  }

  /** @param {ReturnType<typeof getResultsFromExtensions>} promise
   * @param {string} audioLang
   */
  async function getBest(promise, audioLang) {
    const results = await promise

    const bestRequestedAudio = audioLang !== 'jpn' && results.find(result => (result.type === 'best' || result.type === 'alt') && getRequestedAudio(result.parseObject, audioLang) && result.seeders > 9)
    const altRequestedAudio = audioLang !== 'jpn' && results.find(result => getRequestedAudio(result.parseObject, audioLang) && result.seeders > 1)
    const bestGenericAudio = results.find(result => result.type === 'best' || result.type === 'alt' && result.seeders > 9)

    return bestRequestedAudio || altRequestedAudio || bestGenericAudio || results[0]
  }

  function filterResults (results, searchText) {
    return results.filter(({ title }) => title.toLowerCase().includes(searchText.toLowerCase()))
  }

  /** @param {ReturnType<typeof getResultsFromExtensions>} results */
  async function sortResults (results) {
    return (await results).sort((a, b) => b.seeders - a.seeders)
  }
</script>

<script>
  import { nowPlaying as currentMedia } from '../Player/MediaHandler.svelte'
  import { cache, caches } from '@/modules/cache.js'
  import { getMediaMaxEp } from '@/modules/anime.js'
  import TorrentCard from './TorrentCard.svelte'
  import { add } from '@/modules/torrent.js'
  import TorrentSkeletonCard from './TorrentSkeletonCard.svelte'
  import { onDestroy } from 'svelte'
  import { MagnifyingGlass } from 'svelte-radix'

  /** @type {{ media: Media, episode?: number }} */
  export let search

  let countdown = 5
  let timeoutHandle

  /** @param {ReturnType<typeof getBest>} promise */
  async function autoPlay (promise, autoPlay) {
    const best = await promise
    if (!search) return
    if ($settings.rssAutoplay) {
      clearTimeout(timeoutHandle)
      const decrement = () => {
        countdown--
        if (countdown === 0) {
          play(best)
        } else {
          timeoutHandle = setTimeout(decrement, 1000)
        }
      }
      timeoutHandle = setTimeout(decrement, 1000)
    }
  }

  const movie = isMovie(search.media)
  let batch = search.media.status === 'FINISHED' && !movie

  $: resolution = $settings.rssQuality

  $: lookup = sortResults(getResultsFromExtensions({ ...search, batch, movie, resolution }))
  $: best = getBest(lookup, $settings.audioLanguage)

  onDestroy(() => {
    clearTimeout(timeoutHandle)
    search = null
  })

  $: if (!$settings.rssAutoplay) clearTimeout(timeoutHandle)
  $: autoPlay(best, $settings.rssAutoplay)

  $: lookup.catch(err => {
    debug(`Error fetching torrents for ${search.media?.title?.userPreferred} Episode ${search.episode}, ${err.stack}`)
    if (err.message?.toLowerCase()?.includes("no results found") && getMediaMaxEp(search?.media, true) < search?.episode) toast.error(`No torrent found for ${anilistClient.title(search.media)} Episode ${search.episode}!`, {description: `This episode hasn't released yet! ${search?.media?.nextAiringEpisode?.timeUntilAiring ? `\nEpisode ${search.media.nextAiringEpisode.episode} will be released on ${new Date(Date.now() + search.media.nextAiringEpisode.timeUntilAiring * 1000).toDateString()}` : ''}`})
    else toast.error(`No torrent found for ${anilistClient.title(search.media)} Episode ${search.episode}!`, {description: err.message})
  })

  const lastMagnet = cache.getEntry(caches.HISTORY, 'lastMagnet')?.[`${search?.media?.id}`]?.[`${search?.episode}`] || cache.getEntry(caches.HISTORY, 'lastMagnet')?.[`${search?.media?.id}`]?.batch
  $: firstLoad = !firstLoad && lookup.catch(close)
  let searchText = ''

  /** @param {import('@thaunknown/ani-resourced/sources/types.d.ts').Result} result */
  function play (result) {
    $currentMedia = search
    $currentMedia.verified = result.verified
    if (!isNaN(result.seeders) && result.seeders < 10) {
      toast('Availability Warning', {
        description: 'This release is poorly seeded and likely will have playback issues such as buffering!'
      })
    }
    const existingMagnets = cache.getEntry(caches.HISTORY, 'lastMagnet') || {}
    cache.setEntry(caches.HISTORY, 'lastMagnet', { ...existingMagnets, [search?.media?.id]: !result.parseObject?.episode_number || Array.isArray(result.parseObject.episode_number) ? { [`batch`]: result } : { ...(existingMagnets[search?.media?.id] || {}), [`${search.episode}`]: result } })
    add(result.link, { media: search?.media, episode: search?.episode })
    close()
  }

  function episodeInput ({ target }) {
    const episode = Number(target.value)
    if (episode || episode === 0) search.episode = episode
  }

  export let close
</script>

<div class='w-full bg-very-dark position-sticky top-0 z-10 pt-20 px-30'>
  <div class='d-flex'>
    <h3 class='mb-10 font-weight-bold text-white'>Find Torrents</h3>
    <button type='button' class='btn btn-square ml-auto d-flex align-items-center justify-content-center' use:click={close}><X size='1.7rem' strokeWidth='3'/></button>
  </div>
  <div class='metadata-container d-flex flex-wrap ml-20 mr-20'>
    <h4 class='mb-10 text-light'>Auto-Selected Torrent {$settings.rssAutoplay ? `[${countdown}]` : ''}</h4>
    <div class='preferred-audio d-flex align-items-center ml-auto mb-5'>
      <span class='text-nowrap'>Preferred Audio Language</span>
      <select class='form-control w-120 bg-dark ml-10' bind:value={$settings.audioLanguage}>
        <option value='jpn' selected>Japanese</option>
        <option value='eng'>English</option>
        <option value='chi'>Chinese</option>
        <option value='por'>Portuguese</option>
        <option value='spa'>Spanish</option>
        <option value='ger'>German</option>
        <option value='pol'>Polish</option>
        <option value='cze'>Czech</option>
        <option value='dan'>Danish</option>
        <option value='gre'>Greek</option>
        <option value='fin'>Finnish</option>
        <option value='fre'>French</option>
        <option value='hun'>Hungarian</option>
        <option value='ita'>Italian</option>
        <option value='kor'>Korean</option>
        <option value='dut'>Dutch</option>
        <option value='nor'>Norwegian</option>
        <option value='rum'>Romanian</option>
        <option value='rus'>Russian</option>
        <option value='slo'>Slovak</option>
        <option value='swe'>Swedish</option>
        <option value='ara'>Arabic</option>
        <option value='idn'>Indonesian</option>
      </select>
    </div>
  </div>
  {#await best}
    <TorrentSkeletonCard />
  {:then bestRelease}
    <TorrentCard result={bestRelease} {play} media={search.media} />
  {:catch error}
    <div class='p-15 mb-10'><div class='h-100' /></div>
  {/await}
  {#if lastMagnet}
    {#await lookup}
      <h4 class='mb-10 text-light ml-20'>Last Played Torrent</h4>
      <TorrentSkeletonCard />
    {:then results}
      {#each filterResults(results, searchText) as result}
        {#if result.link === lastMagnet.link && result.seeders > 1}
          <h4 class='mb-10 text-light ml-20'>Last Played Torrent</h4>
          <TorrentCard result={result} {play} media={search.media} />
        {/if}
      {/each}
    {/await}
  {/if}
  <div class='input-group mt-20'>
    <div class='input-group-prepend'>
      <MagnifyingGlass size='2.75rem' class='input-group-text bg-dark pr-0' />
    </div>
    <input
      type='search'
      class='form-control bg-dark border-left-0'
      autocomplete='off'
      data-option='search'
      placeholder='Find a specific torrent...' bind:value={searchText} />
  </div>
  <div class='row mt-20 mb-10'>
    <div class='col-12 col-md-6 d-flex align-items-center justify-content-around'>
      <div class='custom-switch'>
        <input type='checkbox' id='rss-autoplay' bind:checked={$settings.rssAutoplay} />
        <label for='rss-autoplay'>Auto-Play Selected {$settings.rssAutoplay ? `[${countdown}]` : ''}</label>
      </div>
      <div class='custom-switch'>
        <input type='checkbox' id='batches' bind:checked={batch} disabled={(search.media.status !== 'FINISHED') || movie} min='1' />
        <label for='batches'>Find Batches</label>
      </div>
    </div>
    <div class='col-12 col-md-6 d-flex align-items-center justify-content-around mt-20 mt-md-0'>
      <div class='w-150 d-flex align-items-center'>
        <span>Episode</span>
        <input type='number' inputmode='numeric' pattern='[0-9]*' class='form-control bg-dark text-right ml-10' value={search.episode} on:input={episodeInput} disabled={(!search.episode && search.episode !== 0) || movie} />
      </div>
      <div class='w-200 d-flex align-items-center'>
        <span>Resolution</span>
        <select class='form-control w-full bg-dark ml-10' bind:value={$settings.rssQuality}>
          <option value='1080' selected>1080p</option>
          <option value='720'>720p</option>
          <option value='540'>540p</option>
          <option value='480'>480p</option>
          <option value=''>Any</option>
        </select>
      </div>
    </div>
  </div>
</div>
<div class='mt-10 px-30'>
  {#await lookup}
    {#each Array.from({ length: 10 }) as _}
      <TorrentSkeletonCard />
    {/each}
  {:then results}
    {#each filterResults(results, searchText) as result}
      <TorrentCard {result} {play} media={search.media} />
    {/each}
  {/await}
</div>

<style>
  .w-120 {
    width: 12rem !important;
  }
  .px-30 {
    padding-left: 3rem;
    padding-right: 3rem;
  }

  /* Behavior for narrow screens (mobile) */
  @media (max-width: 35rem) {
    .metadata-container {
      flex-direction: column !important;
    }
    .preferred-audio {
      margin-left: 0 !important;
    }
  }
</style>
