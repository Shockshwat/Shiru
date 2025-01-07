<script context='module'>
  import { writable } from 'simple-store-svelte'
  import AnimeResolver from '@/modules/animeresolver.js'
  import { videoRx } from '@/modules/util.js'
  import { tick } from 'svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { episodesList } from '@/modules/episodes.js'
  import { getAniMappings } from '@/modules/anime.js'
  import Debug from 'debug'

  const debug = Debug('ui:mediahandler')

  const episodeRx = /Episode (\d+) - (.*)/

  export const nowPlaying = writable({})

  export const files = writable([])

  const processed = writable([])

  const noop = () => {}

  let playFile

  function handleCurrent ({ detail }) {
    const nextMedia = detail?.media
    debug(`Handling current media: ${JSON.stringify(nextMedia?.parseObject)}`)
    if (nextMedia?.parseObject) {
      handleMedia(nextMedia)
    }
  }

  export function findInCurrent (obj) {
    const oldNowPlaying = nowPlaying.value

    if (oldNowPlaying.media?.id === obj.media.id && oldNowPlaying.episode === obj.episode) return false

    const fileList = files.value

    const targetFile = fileList.find(file => file.media?.media?.id === obj.media.id &&
      (file.media?.episode === obj.episode || obj.media.episodes === 1 || (!obj.media.episodes && (obj.episode === 1 || !obj.episode) && (oldNowPlaying.episode === 1 || !oldNowPlaying.episode))) // movie check
    )
    if (!targetFile) return false
    if (oldNowPlaying.media?.id !== obj.media.id) {
      handleMedia(obj, { media: obj.media, episode: obj.episode })
      handleFiles(fileList)
    } else {
      playFile(targetFile)
    }
    return true
  }

  async function handleMedia ({ media, episode, parseObject }, newPlaying) {
    if (media || episode || parseObject) {
      const ep = Number(episode || parseObject?.episode_number) === 0 ? 0 : (Number(episode || parseObject?.episode_number) || null)

      const streamingTitle = media?.streamingEpisodes.find(episode => episodeRx.exec(episode.title) && Number(episodeRx.exec(episode.title)[1]) === ep)
      let streamingEpisode = streamingTitle
      if (!newPlaying && (!streamingEpisode || !episodeRx.exec(streamingEpisode.title) || episodeRx.exec(streamingEpisode.title)[2].toLowerCase()?.trim()?.startsWith('episode') || media?.streamingEpisodes.find(episode => episodeRx.exec(episode.title) && Number(episodeRx.exec(episode.title)[1]) === (media?.episodes + 1)))) {
        // better episode title fetching, especially for "two cour" anime releases like Dead Mount Play... shocker, the anilist database for streamingEpisodes can be wrong!
        const { episodes, specialCount, episodeCount } = await getAniMappings(media?.id)
        const needsValidation = !(!specialCount || (media?.episodes === episodeCount && episodes && episodes[Number(episode)]))
        streamingEpisode = (!needsValidation && episodes && episodes[Number(episode)]?.title?.en && episodeRx.exec(`Episode ${Number(episode)} - ` + episodes[Number(episode)]?.title?.en)) ? {title: (`Episode ${Number(episode)} - ` + episodes[Number(episode)]?.title?.en)} : (needsValidation && media?.status === 'FINISHED') ? {title: (`Episode ${Number(episode)} - ` + (episodes[Number(episode)]?.title?.en || `Episode ${Number(episode)}`))} : streamingTitle
        if (!streamingEpisode || !episodeRx.exec(streamingEpisode.title) || episodeRx.exec(streamingEpisode.title)[2].toLowerCase()?.trim()?.startsWith('episode')) {
          const episodeTitle = await episodesList.getSingleEpisode(media?.idMal, Number(episode)) // animappings sometimes doesn't have all the data, so we can use an alternative api to fetch episode information.,
          if (episodeTitle && episodeTitle?.title) streamingEpisode = {title: (`Episode ${Number(episode)} - ` + episodeTitle.title)}
        }
      }
      if (streamingEpisode?.title) {
        const titleParts = streamingEpisode.title.split(' - ')
        streamingEpisode.title = (titleParts?.[0]?.trim() === titleParts?.[1]?.trim()) ? titleParts?.[0]?.trim() : streamingEpisode.title
      }

      const details = {
        title: anilistClient.title(media) || parseObject.anime_title || parseObject.file_name,
        episode: ep,
        episodeTitle: streamingEpisode && (episodeRx.exec(streamingEpisode.title)?.[2] || episodeRx.exec(streamingEpisode.title)),
        thumbnail: media?.coverImage.extraLarge
      }

      nowPlaying.set({
          ...(newPlaying ? newPlaying : {}),
          media,
          ...details
      })
      if (!newPlaying) {
          setMediaSession(nowPlaying.value)
      }
      debug(`Now playing as been set to: ${JSON.stringify(details)}`)
    }
  }

  const TYPE_EXCLUSIONS = ['ED', 'ENDING', 'NCED', 'NCOP', 'OP', 'OPENING', 'PREVIEW', 'PV']

  // find the best media in batch to play
  // currently in progress or unwatched
  // tv, movie, ona, ova, special
  function findPreferredPlaybackMedia (videoFiles) {
    for (const { media } of videoFiles) {
      const cachedMedia = anilistClient.mediaCache.value[media.media?.id] || media?.media
      if (cachedMedia?.mediaListEntry?.status === 'CURRENT') return { media: cachedMedia, episode: (cachedMedia.mediaListEntry.progress || 0) + 1 }
    }

    for (const { media } of videoFiles) {
      const cachedMedia = anilistClient.mediaCache.value[media.media?.id] || media?.media
      if (cachedMedia?.mediaListEntry?.status === 'REPEATING') return { media: cachedMedia, episode: (cachedMedia.mediaListEntry.progress || 0) + 1 }
    }

    let lowestPlanning
    for (const { media } of videoFiles) {
      const cachedMedia = anilistClient.mediaCache.value[media.media?.id] || media?.media
      if (cachedMedia?.mediaListEntry?.status === 'PLANNING' && (!lowestPlanning || (((Number(lowestPlanning.episode) >= Number(media?.episode)) || (media?.episode && !lowestPlanning.episode)) && Number(lowestPlanning.season) >= Number(media?.season)))) lowestPlanning = { media: cachedMedia, episode: media?.episode, season: media?.season }
    }
    if (lowestPlanning) return lowestPlanning

    // unwatched
    let lowestUnwatched
    for (const format of ['TV', 'MOVIE', 'ONA', 'OVA', 'SPECIAL']) {
      for (const { media } of videoFiles) {
        const cachedMedia = anilistClient.mediaCache.value[media.media?.id] || media?.media
        if (cachedMedia?.format === format && !cachedMedia.mediaListEntry && (!lowestUnwatched || (((Number(lowestUnwatched.episode) >= Number(media?.episode)) || (media?.episode && !lowestUnwatched.episode)) && Number(lowestUnwatched.season) >= Number(media?.season)))) lowestUnwatched = { media: cachedMedia, episode: media?.episode, season: media?.season }
      }
    }
    if (lowestUnwatched) return lowestUnwatched

    // highest occurrence if all else fails - unlikely
    const max = highestOccurrence(videoFiles, file => file.media.media?.id).media
    if (max?.media) {
      return { media: max.media, episode: ((anilistClient.mediaCache.value[max.media?.id] || max.media).mediaListEntry?.progress + 1 || 1) }
    }
  }

  function fileListToDebug (files) {
    return files?.map(({ name, media, url }) => `\n${name} ${media?.parseObject?.anime_title} ${media?.parseObject?.episode_number} ${media?.media?.title?.userPreferred} ${media?.episode}`).join('')
  }

  async function handleFiles (files) {
    debug(`Got ${files?.length} files`, fileListToDebug(files))
    if (!files?.length) return processed.set(files)
    let videoFiles = []
    const otherFiles = []
    const torrentNames = []
    for (const file of files) {
      if (videoRx.test(file.name)) {
        videoFiles.push(file)
      } else {
        otherFiles.push(file)
      }
      if (file.torrent_name) torrentNames.push(file.torrent_name)
    }
    let newPlaying = nowPlaying.value
    const resolved = await AnimeResolver.resolveFileAnime(videoFiles.map(file => file.name))
    if (resolved[0].failed) {
      debug('Media has failed to resolve using the file name, trying again using the torrent name ...')
      const torrentName = [...new Set(torrentNames)][0] // temporary, may need to handle multiple torrents in the future.
      const resolved = await AnimeResolver.resolveFileAnime(videoFiles.map(file => `${torrentName} ${file.name}`))
      videoFiles.map(file => {
          file.media = resolved.find(({ parseObject }) => AnimeResolver.cleanFileName(`${torrentName} ${file.name}`).includes(parseObject.file_name))
          return file
      })
    } else {
      videoFiles.map(file => {
          file.media = resolved.find(({ parseObject }) => AnimeResolver.cleanFileName(file.name).includes(parseObject.file_name))
          return file
      })
    }
    videoFiles = videoFiles.filter(file => {
        if (typeof file.media.parseObject.anime_type === 'string') return !TYPE_EXCLUSIONS.includes(file.media.parseObject.anime_type.toUpperCase())
        else if (Array.isArray(file.media.parseObject.anime_type)) { // rare edge cases where the type is an array, only batches like a full season + movie + special.
            for (let animeType of file.media.parseObject.anime_type) {
                if (TYPE_EXCLUSIONS.includes(animeType.toUpperCase())) return false
            }
        }
        return true
    })
    if (newPlaying?.verified && videoFiles.length === 1) {
      debug('Media was verified, skipping verification')
      videoFiles[0].media.media = newPlaying.media
      if (newPlaying.episode) videoFiles[0].media.episode = newPlaying.episode
    }
    debug(`Resolved ${videoFiles?.length} video files`, fileListToDebug(videoFiles))

    if (!newPlaying || Object.keys(newPlaying).length === 0) {
      newPlaying = findPreferredPlaybackMedia(videoFiles)
      debug(`Found preferred playback media: ${newPlaying?.media?.id}:${newPlaying?.media?.title?.userPreferred} ${newPlaying?.episode}`)
    }

    const filtered = newPlaying?.media && videoFiles.filter(file => file.media?.media?.id && file.media?.media?.id === newPlaying.media.id)

    debug(`Filtered ${filtered?.length} files based on media`, fileListToDebug(filtered))

    let result
    if (filtered?.length) {
      result = filtered
    } else {
      const max = highestOccurrence(videoFiles, file => file.media.parseObject.anime_title).media.parseObject.anime_title
      debug(`Highest occurrence anime title: ${max}`)
      result = videoFiles.filter(file => file.media.parseObject.anime_title === max)
    }
    result.sort((a, b) => a.media.episode - b.media.episode)
    result.sort((a, b) => (b.media.parseObject.anime_season ?? 1) - (a.media.parseObject.anime_season ?? 1))

    debug(`Sorted ${result.length} files`, fileListToDebug(result))

    processed.set([...result, ...otherFiles])
    await tick()
    const file = (newPlaying?.episode && (result.find(({ media }) => media.episode === newPlaying.episode) || result.find(({ media }) => media.episode === 1))) || result[0]
    handleMedia(file?.media, newPlaying)
    playFile(file || 0)
  }

  // find element with most occurrences in array according to map function
  const highestOccurrence = (arr = [], mapfn = a => a) => arr.reduce((acc, el) => {
    const mapped = mapfn(el)
    acc.sums[mapped] = (acc.sums[mapped] || 0) + 1
    acc.max = (acc.max !== undefined ? acc.sums[mapfn(acc.max)] : -1) > acc.sums[mapped] ? acc.max : el
    return acc
  }, { sums: {} }).max

  files.subscribe((files = []) => {
    handleFiles(files)
    return noop
  })

  function setMediaSession (nowPlaying) {
    if (typeof MediaMetadata === 'undefined') return
    const name = [nowPlaying.title, nowPlaying.episode, nowPlaying.episodeTitle, 'Shiru'].filter(i => i).join(' - ')

    navigator.mediaSession.metadata = nowPlaying.thumbnail
        ? new MediaMetadata({
            title: name,
            artwork: [
                {
                    src: nowPlaying.thumbnail,
                    sizes: '256x256',
                    type: 'image/jpg'
                }
            ]
        })
        : new MediaMetadata({ title: name })
  }
</script>

<script>
  import Player from './Player.svelte'

  export let miniplayer = false
  export let page = 'home'
  export let overlay = 'none'
</script>

<Player files={$processed} {miniplayer} media={$nowPlaying} bind:playFile bind:page bind:overlay on:current={handleCurrent} />
