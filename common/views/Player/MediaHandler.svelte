<script context='module'>
  import { writable } from 'simple-store-svelte'
  import AnimeResolver from '@/modules/animeresolver.js'
  import { videoRx } from '@/modules/util.js'
  import { tick } from 'svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { mediaCache } from '@/modules/cache.js'
  import { episodesList } from '@/modules/episodes.js'
  import { getAniMappings, getKitsuMappings, hasZeroEpisode } from '@/modules/anime.js'
  import Debug from 'debug'

  const debug = Debug('ui:mediahandler')

  const episodeRx = /Episode (\d+) - (.*)/

  /**
   * This works pretty well now but isn't the most well designed, primarily this could be improved to decrease load times and the number of anilist queries by storing verified media mapped to their torrent.
   *
   * TODO: rewrite the MediaHandler, put less focus on "nowPlaying" and separately store verified (resolved) media.
   */
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

  const zeroEpisodes = new Map()
  async function checkForZero(media) {
    if (zeroEpisodes.has(`${media?.id}`)) {
        return zeroEpisodes.get(`${media?.id}`)
    }
    const promiseData = (async () => await hasZeroEpisode(media))()
    zeroEpisodes.set(`${media?.id}`, promiseData)
    return promiseData
  }

  /**
   * Dynamically detects the number of episodes combined into a single video file.
   * This is useful for series like "I'm Living With a Otaku NEET Kunoichi?!", where two or more episodes are merged into one file.
   *
   * An episode range is displayed visually in the player, but for auto-completion, the highest episode number is used when the full video file is watched.
   * @param {number} duration - The duration of the video in seconds.
   */
  function handleRanged({ detail: duration }) {
      if (duration && (duration > 120) && nowPlaying.value?.media?.duration) {
          debug(`Duration of the current media has changed, checking for multiple episodes in the video file for: ${JSON.stringify(nowPlaying.value)}`)
          const mediaDuration = nowPlaying.value?.media?.duration * 60
          if (duration > (mediaDuration + 120)) { // Add 2 minutes (120 second) buffer
              debug(`Multiple episodes have been detected in the video file for: ${JSON.stringify(nowPlaying.value)}`)
              const episodeMultiplier = Math.round(duration / mediaDuration) // Round to nearest whole number
              handleMedia({
                  media: nowPlaying.value?.media,
                  episode: nowPlaying.value?.episode * episodeMultiplier,
                  episodeRange: `${(nowPlaying.value?.episode * episodeMultiplier) - (episodeMultiplier - 1)} ~ ${(nowPlaying.value?.episode * episodeMultiplier)}`,
                  parseObject: nowPlaying.value?.details?.parseObject
              })
          }
      }
  }

  async function handleMedia ({ media, episode, episodeRange, parseObject }, newPlaying) {
    if (media || episode || parseObject) {
      const zeroEpisode = media && await checkForZero(media)
      const ep = (Number(episode || parseObject?.episode_number) === 0) || (zeroEpisode && !episode) ? 0 : (Number(episode || parseObject?.episode_number) || null)
      const streamingTitle = media?.streamingEpisodes.find(episode => episodeRx.exec(episode.title) && Number(episodeRx.exec(episode.title)[1]) === ep)
      let streamingEpisode = streamingTitle
      if (!newPlaying && (!streamingEpisode || !episodeRx.exec(streamingEpisode.title) || episodeRx.exec(streamingEpisode.title)[2].toLowerCase()?.trim()?.startsWith('episode') || media?.streamingEpisodes.find(episode => episodeRx.exec(episode.title) && Number(episodeRx.exec(episode.title)[1]) === (media?.episodes + 1)))) {
        // better episode title fetching, especially for "two cour" anime releases like Dead Mount Play... shocker, the anilist database for streamingEpisodes can be wrong!
        const { episodes, specialCount, episodeCount } = await getAniMappings(media?.id) || {}
        let mappingsTitle = episode && episodes && episodes[Number(episode)]?.title?.en
        if (episode && (!mappingsTitle || mappingsTitle.length === 0)) {
          const kitsuMappings = (await getKitsuMappings(media?.id))?.data?.find(ep => ep?.attributes?.number === Number(episode))?.attributes
          mappingsTitle = kitsuMappings?.titles?.en_us || kitsuMappings?.titles?.en_jp || (episodes && episodes[Number(episode)]?.title?.jp)
        }
        const needsValidation = !(!specialCount || (media?.episodes === episodeCount && episodes && episodes[Number(episode)]))
        streamingEpisode = (!needsValidation && mappingsTitle && episodeRx.exec(`Episode ${Number(episode)} - ` + mappingsTitle)) ? {title: (`Episode ${Number(episode)} - ` + mappingsTitle)} : (needsValidation && media?.status === 'FINISHED') ? {title: (`Episode ${Number(episode)} - ` + (mappingsTitle || `Episode ${Number(episode)}`))} : streamingTitle
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
        episodeRange,
        episodeTitle: streamingEpisode && (episodeRx.exec(streamingEpisode.title)?.[2] || episodeRx.exec(streamingEpisode.title)),
        thumbnail: media?.coverImage.extraLarge
      }

      nowPlaying.set({
          ...(newPlaying ? newPlaying : {}),
          media,
          parseObject,
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
  async function findPreferredPlaybackMedia (videoFiles) {
    for (const { media } of videoFiles) {
      const cachedMedia = mediaCache.value[media.media?.id] || media?.media
      const zeroEpisode = await checkForZero(cachedMedia)
      if (cachedMedia?.mediaListEntry?.status === 'CURRENT') return { media: cachedMedia, episode: (cachedMedia.mediaListEntry.progress || 0) + (!zeroEpisode ? 1 : 0) }
    }

    for (const { media } of videoFiles) {
      const cachedMedia = mediaCache.value[media.media?.id] || media?.media
        const zeroEpisode = await checkForZero(cachedMedia)
      if (cachedMedia?.mediaListEntry?.status === 'REPEATING') return { media: cachedMedia, episode: (cachedMedia.mediaListEntry.progress || 0) + (!zeroEpisode ? 1 : 0) }
    }

    let lowestPlanning
    for (const { media } of videoFiles) {
      const cachedMedia = mediaCache.value[media.media?.id] || media?.media
      if (cachedMedia?.mediaListEntry?.status === 'PLANNING' && (!lowestPlanning || (((Number(lowestPlanning.episode) >= Number(media?.episode)) || (media?.episode && !lowestPlanning.episode)) && Number(lowestPlanning.season) >= Number(media?.season)))) lowestPlanning = { media: cachedMedia, episode: media?.episode, season: media?.season }
    }
    if (lowestPlanning) return lowestPlanning

    // unwatched
    let lowestUnwatched
    for (const format of ['TV', 'MOVIE', 'ONA', 'OVA', 'SPECIAL']) {
      for (const { media } of videoFiles) {
        const cachedMedia = mediaCache.value[media.media?.id] || media?.media
        if (cachedMedia?.format === format && !cachedMedia.mediaListEntry && (!lowestUnwatched || (((Number(lowestUnwatched.episode) >= Number(media?.episode)) || (media?.episode && !lowestUnwatched.episode)) && Number(lowestUnwatched.season) >= Number(media?.season)))) lowestUnwatched = { media: cachedMedia, episode: media?.episode, season: media?.season }
      }
    }
    if (lowestUnwatched) return lowestUnwatched

    // highest occurrence if all else fails - unlikely
    const max = highestOccurrence(videoFiles, file => file.media.media?.id)?.media
    if (max?.media) {
      const zeroEpisode = await checkForZero(max?.media)
      return { media: max.media, episode: ((mediaCache.value[max.media?.id] || max.media).mediaListEntry?.progress + (!zeroEpisode ? 1 : 0) || (!zeroEpisode ? 1 : 0)) }
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
    debug(`Resolved ${videoFiles?.length} video files`, fileListToDebug(videoFiles))

    const newPlaying = await findPreferredPlaybackMedia(videoFiles)
    debug(`Found preferred playback media: ${newPlaying?.media?.id}:${newPlaying?.media?.title?.userPreferred} ${newPlaying?.episode}`)

    const filtered = newPlaying?.media && videoFiles.filter(file => (file.media?.media?.id && file.media?.media?.id === newPlaying.media.id) || !file.media?.media?.id)
    debug(`Filtered ${filtered?.length} files based on media`, fileListToDebug(filtered))

    let result
    if (filtered?.length) {
      result = filtered
    } else {
      const max = highestOccurrence(videoFiles, file => file.media.parseObject.anime_title)?.media?.parseObject?.anime_title
      if (max) {
          debug(`Highest occurrence anime title: ${max}`)
          result = videoFiles.filter(file => file.media.parseObject.anime_title === max)
      } else {
          result = remapByTitle(videoFiles)
          debug(`All occurrences were identical, guessing the episode and/or season and attaching to the files`, fileListToDebug(result))
      }
    }
    result = remapByTitle(result)
    result.sort((a, b) => a.media.episode - b.media.episode)
    result.sort((a, b) => (b.media.parseObject.anime_season ?? 1) - (a.media.parseObject.anime_season ?? 1))
    debug(`Sorted ${result.length} files`, fileListToDebug(result))

    processed.set([...result, ...otherFiles])
    await tick()
    const file = (newPlaying?.episode && (result.find(({ media }) => media.episode === newPlaying.episode) || result.find(({ media }) => media.episode === 1))) || result[0]
    handleMedia(file?.media, newPlaying)
    playFile(file || 0)
  }

  // find element with most occurrences in array according to map function, if occurrences are identical return null.
  const highestOccurrence = (arr = [], mapfn = a => a) => {
      const result = arr.reduce((acc, el) => {
          const mapped = mapfn(el)
          acc.sums[mapped] = (acc.sums[mapped] || 0) + 1
          acc.max = (acc.max !== undefined ? acc.sums[mapfn(acc.max)] : -1) > acc.sums[mapped] ? acc.max : el
          return acc
      }, { sums: {} })
      const occurrences = Object.values(result.sums)
      return occurrences.every(count => count === occurrences[0]) ? null : result.max
  }

  // map the episode and season by attempting to fetch them from the title, should only occur in when there is a severe error in media resolving.
  const remapByTitle = (arr = []) => {
      return arr.map((el) => {
          if (!el.media.episode) {
              const matches = el.media.parseObject.anime_title.match(/(\d{2})/g)
              if (matches && matches.length > 0) {
                  const seasonNumber = matches[0]
                  const episodeNumber = matches[matches.length - 1]
                  el.media.season = parseInt(seasonNumber)
                  el.media.episode = parseInt(episodeNumber)
                  el.media.parseObject.anime_title = el.media.parseObject.anime_title.replace(seasonNumber, '').replace(episodeNumber, '').trim()
              }
          }
          return el
      })
  }

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
  export let overlay = []
</script>

<Player files={$processed} {miniplayer} media={$nowPlaying} bind:playFile bind:page bind:overlay on:current={handleCurrent} on:duration={handleRanged} />
