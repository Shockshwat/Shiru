import { DOMPARSER, getRandomInt, countdown } from './util.js'
import { codes, anilistClient } from './anilist.js'
import _anitomyscript from 'anitomyscript'
import { toast } from 'svelte-sonner'
import SectionsManager from './sections.js'
import { page } from '@/App.svelte'
import clipboard from './clipboard.js'
import { search, key } from '@/views/Search.svelte'
import { playAnime } from '@/views/TorrentSearch/TorrentModal.svelte'
import { animeSchedule } from '@/modules/animeschedule.js'
import { settings } from '@/modules/settings.js'
import { cache, caches } from '@/modules/cache.js'
import Helper from '@/modules/helper.js'

import { Drama, BookHeart, MountainSnow, Laugh, TriangleAlert, Droplets, FlaskConical, Ghost, Skull, HeartPulse, Volleyball, Car, Brain, Footprints, Guitar, Bot, WandSparkles, Activity } from 'lucide-svelte'

import Debug from 'debug'
const debug = Debug('ui:anime')

const imageRx = /\.(jpeg|jpg|gif|png|webp)/i

clipboard.on('files', ({ detail }) => {
  for (const file of detail) {
    if (file.type.startsWith('image')) {
      toast.promise(traceAnime(file), {
        description: 'You can also paste an URL to an image.',
        loading: 'Looking up anime for image...',
        success: 'Found anime for image!',
        error: 'Couldn\'t find anime for specified image! Try to remove black bars, or use a more detailed image.'
      })
    }
  }
})

clipboard.on('text', ({ detail }) => {
  for (const { type, text } of detail) {
    let src = null
    if (type === 'text/html') {
      src = DOMPARSER(text, 'text/html').querySelectorAll('img')[0]?.src
    } else if (imageRx.exec(text)) {
      src = text
    }
    if (src) {
      toast.promise(traceAnime(src), {
        description: 'You can also paste an URL to an image.',
        loading: 'Looking up anime for image...',
        success: 'Found anime for image!',
        error: 'Couldn\'t find anime for specified image! Try to remove black bars, or use a more detailed image.'
      })
    }
  }
})

export async function traceAnime (image) { // WAIT lookup logic
  let options
  let url = `https://api.trace.moe/search?cutBorders&url=${image}`
  if (image instanceof Blob) {
    options = {
      method: 'POST',
      body: image,
      headers: { 'Content-type': image.type }
    }
    url = 'https://api.trace.moe/search'
  }
  const res = await fetch(url, options)
  const { result } = await res.json()

  if (result?.length) {
    const ids = result.map(({ anilist }) => anilist)
    search.value = {
      clearNext: true,
      load: (page = 1, perPage = 50, variables = {}) => {
        const res = anilistClient.searchIDS({ page, perPage, id: ids, ...SectionsManager.sanitiseObject(variables) }).then(res => {
          for (const index in res.data?.Page?.media) {
            const media = res.data.Page.media[index]
            const counterpart = result.find(({ anilist }) => anilist === media.id)
            res.data.Page.media[index] = {
              media,
              episode: counterpart.episode,
              similarity: counterpart.similarity,
              episodeData: {
                image: counterpart.image,
                video: counterpart.video
              }
            }
          }
          res.data?.Page?.media.sort((a, b) => b.similarity - a.similarity)
          return res
        })
        return SectionsManager.wrapResponse(res, result.length, 'episode')
      }
    }
    key.value = {}
    page.value = 'search'
  } else {
    throw new Error('Search Failed \n Couldn\'t find anime for specified image! Try to remove black bars, or use a more detailed image.')
  }
}

function constructChapters (results, duration) {
  const chapters = results.map(result => {
    const diff = duration - result.episodeLength
    return {
      start: (result.interval.startTime + diff) * 1000,
      end: (result.interval.endTime + diff) * 1000,
      text: result.skipType.toUpperCase()
    }
  })
  const ed = chapters.find(({ text }) => text === 'ED')
  const recap = chapters.find(({ text }) => text === 'RECAP')
  if (recap) recap.text = 'Recap'

  chapters.sort((a, b) => a - b)
  if ((chapters[0].start | 0) !== 0) {
    chapters.unshift({ start: 0, end: chapters[0].start, text: chapters[0].text === 'OP' ? 'Intro' : 'Episode' })
  }
  if (ed) {
    if ((ed.end | 0) + 5000 - duration * 1000 < 0) {
      chapters.push({ start: ed.end, end: duration * 1000, text: 'Preview' })
    }
  } else if ((chapters[chapters.length - 1].end | 0) + 5000 - duration * 1000 < 0) {
    chapters.push({
      start: chapters[chapters.length - 1].end,
      end: duration * 1000,
      text: 'Episode'
    })
  }

  for (let i = 0, len = chapters.length - 2; i <= len; ++i) {
    const current = chapters[i]
    const next = chapters[i + 1]
    if ((current.end | 0) !== (next.start | 0)) {
      chapters.push({
        start: current.end,
        end: next.start,
        text: 'Episode'
      })
    }
  }

  chapters.sort((a, b) => a.start - b.start)

  return chapters
}

export async function getChaptersAniSkip (file, duration) {
  const resAccurate = await fetch(`https://api.aniskip.com/v2/skip-times/${file.media.media.idMal}/${file.media.episode}/?episodeLength=${duration}&types=op&types=ed&types=recap`)
  const jsonAccurate = await resAccurate.json()

  const resRough = await fetch(`https://api.aniskip.com/v2/skip-times/${file.media.media.idMal}/${file.media.episode}/?episodeLength=0&types=op&types=ed&types=recap`)
  const jsonRough = await resRough.json()

  const map = {}
  for (const result of [...jsonAccurate.results, ...jsonRough.results]) {
    map[result.skipType] ||= result
  }

  const results = Object.values(map)
  if (!results.length) return []
  return constructChapters(results, duration)
}

export function getMediaMaxEp (media, playable) {
  if (!media) return 0
  else if (playable) return media.nextAiringEpisode?.episode - 1 || nextAiring(media.airingSchedule?.nodes)?.episode - 1 || media.episodes
  else return Math.max(media.airingSchedule?.nodes?.[media.airingSchedule?.nodes?.length - 1]?.episode || 0, media.airingSchedule?.nodes?.length || 0, (!media.streamingEpisodes || (media.status === 'FINISHED' && media.episodes) ? 0 : media.streamingEpisodes?.filter((ep) => { const match = (/Episode (\d+(\.\d+)?) - /).exec(ep.title); return match ? Number.isInteger(parseFloat(match[1])) : false}).length), media.episodes || 0, media.nextAiringEpisode?.episode || 0)
}

// utility method for correcting anitomyscript woes for what's needed
export async function anitomyscript (...args) {
  // @ts-ignore
  const res = await _anitomyscript(...args)

  const parseObjs = Array.isArray(res) ? res : [res]

  for (const obj of parseObjs) {
    obj.anime_title ??= ''
    const seasonMatch = obj.anime_title.match(/S(\d{2})E(\d{2})|season-(\d+)/i)
    if (seasonMatch) {
      if (seasonMatch[1] && seasonMatch[2]) {
        obj.anime_season = seasonMatch[1]
        obj.episode_number = seasonMatch[2]
        obj.anime_title = obj.anime_title.replace(/S(\d{2})E(\d{2})/, '')
      } else if (seasonMatch[3]) {
        obj.anime_season = seasonMatch[3]
        obj.anime_title = obj.anime_title.replace(/season-\d+/i, '')
      }
    } else if (Array.isArray(obj.anime_season)) {
      obj.anime_season = obj.anime_season[0]
    }
    const yearMatch = obj.anime_title.match(/ (19[5-9]\d|20\d{2})/)
    if (yearMatch && Number(yearMatch[1]) <= (new Date().getUTCFullYear() + 1)) {
      obj.anime_year = yearMatch[1]
      obj.anime_title = obj.anime_title.replace(/ (19[5-9]\d|20\d{2})/, '')
    }
    if (Number(obj.anime_season) > 1) obj.anime_title += ' S' + obj.anime_season
  }
  debug(`AnitoMyScript found titles: ${JSON.stringify(parseObjs)}`)
  return parseObjs
}

//TODO: Mushoku zero episodes, they're weird. Why does season 1 part 1 show a zero episode when its a part of season 2 part 2...? We could manually specify it since very few series do this but its better to programmatically guestimate. We are not a database.
export async function hasZeroEpisode(media, existingMappings) { // really wish they could make fetching zero episodes less painful.
  if (!media) return null
  const mappings = existingMappings || (await getAniMappings(media.id)) || {}
  let hasZeroEpisode = media.streamingEpisodes?.filter((ep) => { const match = (/Episode (\d+(\.\d+)?) - /).exec(ep.title); return match ? Number.isInteger(parseFloat(match[1])) && Number(parseFloat(match[1])) === 0 : false})
  if (hasZeroEpisode?.length > 0 && media.episodes >= media.streamingEpisodes?.length) {
    return [{...hasZeroEpisode[0], title: hasZeroEpisode[0]?.title?.replace('Episode 0 - ', '')}]
  } else if (!(media.episodes && media.episodes === mappings?.episodeCount && media.status === 'FINISHED')) {
    const special = (mappings?.episodes?.S0 || mappings?.episodes?.s0 || mappings?.episodes?.S1 || mappings?.episodes?.s1)
    if (mappings?.specialCount > 0 && special?.airedBeforeEpisodeNumber > 0) { // very likely it's a zero episode, streamingEpisodes were likely just empty...
      return [{title: special.title?.en, thumbnail: special.image, length: special.length, summary: special.summary, airingAt: special.airDateUtc}]
    }
  }
  return null
}

export const durationMap = { // guesstimate durations based off format type.
  TV: 25,
  TV_SHORT: 5,
  MOVIE: 90,
  SPECIAL: 45,
  OVA: 25,
  ONA: 25,
  MUSIC: 5,
  undefined: 5,
  null: 5,
}

export const formatMap = {
  TV: 'TV Series',
  TV_SHORT: 'TV Short',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Music',
  undefined: 'N/A',
  null: 'N/A'
}

export const statusColorMap = {
  CURRENT: 'rgb(61,180,242)',
  PLANNING: 'rgb(247,154,99)',
  COMPLETED: 'rgb(123,213,85)',
  PAUSED: 'rgb(250,122,122)',
  REPEATING: '#3baeea',
  DROPPED: 'rgb(232,93,117)'
}

export const genreIcons = {
  'Action': Activity,
  'Adventure': MountainSnow,
  'Comedy': Laugh,
  'Drama': Drama,
  'Ecchi': Droplets,
  'Fantasy': WandSparkles,
  'Hentai': TriangleAlert,
  'Horror': Skull,
  'Mahou Shoujo': Drama,
  'Mecha': Bot,
  'Music': Guitar,
  'Mystery': Footprints,
  'Psychological': Brain,
  'Romance': BookHeart,
  'Sci-Fi': FlaskConical,
  'Slice of Life': Car,
  'Sports': Volleyball,
  'Supernatural': Ghost,
  'Thriller': HeartPulse
}

export const genreList = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  ...(settings.value.adult === 'hentai' ? ['Hentai'] : []),
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller'
]

export const tagList = [
  'Chuunibyou',
  'Demons',
  'Food',
  'Heterosexual',
  'Isekai',
  'Iyashikei',
  'Josei',
  'Magic',
  'Yuri',
  'Love Triangle',
  'Female Harem',
  'Male Harem',
  'Mixed Gender Harem',
  'Arranged Marriage',
  'Marriage',
  'Martial Arts',
  'Military',
  'Nudity',
  'Parody',
  'Reincarnation',
  'Satire',
  'School',
  'Seinen',
  'Shoujo',
  'Shounen',
  'Slavery',
  'Space',
  'Super Power',
  'Superhero',
  'Teens\' Love',
  'Unrequited Love',
  'Vampire',
  'Kids',
  'Gender Bending',
  'Body Swapping',
  'Boys\' Love',
  'Cute Boys Doing Cute Things',
  'Cute Girls Doing Cute Things',
  'Acting',
  'Afterlife',
  'Age Gap',
  'Age Regression',
  'Aliens',
  'Alternate Universe',
  'Amnesia',
  'Angels',
  'Anti-Hero',
  'Archery',
  'Artificial Intelligence',
  'Assassins',
  'Asexual',
  'Augmented Reality',
  'Band',
  'Bar',
  'Battle Royale',
  'Board Game',
  'Boarding School',
  'Bullying',
  'Calligraphy',
  'CGI',
  'Classic Literature',
  'College',
  'Cosplay',
  'Crime',
  'Crossdressing',
  'Cult',
  'Dancing',
  'Death Game',
  'Desert',
  'Disability',
  'Drawing',
  'Dragons',
  'Dungeon',
  'Elf',
  'Espionage',
  'Fairy',
  'Femboy',
  'Female Protagonist',
  'Fashion',
  'Foreign',
  'Full CGI',
  'Fugitive',
  'Gambling',
  'Ghost',
  'Gods',
  'Goblin',
  'Guns',
  'Gyaru',
  'Hikikomori',
  'Historical',
  'Homeless',
  'Idol',
  'Inn',
  'Kaiju',
  'Konbini',
  'Kuudere',
  'Language Barrier',
  'Makeup',
  'Maids',
  'Male Protagonist',
  'Matriarchy',
  'Matchmaking',
  'Mermaid',
  'Monster Boy',
  'Monster Girl',
  'Natural Disaster',
  'Necromancy',
  'Ninja',
  'Nun',
  'Office',
  'Office Lady',
  'Omegaverse',
  'Orphan',
  'Outdoor',
  'Photography',
  'Pirates',
  'Polyamorous',
  'Post-Apocalyptic',
  'Primarily Adult Cast',
  'Primarily Female Cast',
  'Primarily Male Cast',
  'Primarily Teen Cast',
  'Prison',
  'Rakugo',
  'Restaurant',
  'Robots',
  'Rural',
  'Samurai',
  'School Club',
  'Shapeshifting',
  'Shrine Maiden',
  'Skeleton',
  'Slapstick',
  'Snowscape',
  'Space',
  'Spearplay',
  'Succubus',
  'Surreal Comedy',
  'Survival',
  'Swordplay',
  'Teacher',
  'Time Loop',
  'Time Manipulation',
  'Time Skip',
  'Transgender',
  'Tsundere',
  'Twins',
  'Urban',
  'Urban Fantasy',
  'Video Games',
  'Villainess',
  'Virtual World',
  'VTuber',
  'War',
  'Werewolf',
  'Witch',
  'Work',
  'Writing',
  'Wuxia',
  'Yakuza',
  'Yandere',
  'Youkai',
  'Zombie',
  ...(settings.value.adult === 'hentai' ? [
  'Ahegao',
  'Amputation',
  'Anal Sex',
  'Armpits',
  'Ashikoki',
  'Asphyxiation',
  'Blackmail',
  'Bondage',
  'Boobjob',
  'Cervix Penetration',
  'Cheating',
  'Cumflation',
  'Cunnilingus',
  'Deepthroat',
  'Defloration',
  'DILF',
  'Double Penetration',
  'Erotic Piercings',
  'Exhibitionism',
  'Facial',
  'Feet',
  'Fellatio',
  'Femdom',
  'Fisting',
  'Flat Chest',
  'Futanari',
  'Group Sex',
  'Hair Pulling',
  'Handjob',
  'Human Pet',
  'Hypersexuality',
  'Incest',
  'Inseki',
  'Irrumatio',
  'Lactation',
  'Large Breasts',
  'Male Pregnancy',
  'Masochism',
  'Masturbation',
  'Mating Press',
  'MILF',
  'Nakadashi',
  'Netorare',
  'Netorase',
  'Netori',
  'Pet Play',
  'Pregnant',
  'Prostitution',
  'Public Sex',
  'Rape',
  'Rimjob',
  'Sadism',
  'Scat',
  'Scissoring',
  'Sex Toys',
  'Squirting',
  'Sumata',
  'Sweat',
  'Tentacles',
  'Threesome',
  'Virginity',
  'Vore',
  'Voyeur',
  'Watersports',
  'Zoophilia'
  ] : [])
]

export async function playMedia (media) {
  let ep = 1
  if (media.mediaListEntry) {
    const { status, progress } = media.mediaListEntry
    if (progress) {
      if (status === 'COMPLETED') {
        await setStatus('REPEATING', { episode: 0 }, media)
      } else {
        ep = Math.min(getMediaMaxEp(media, true) || (progress + 1), progress + 1)
      }
    }
  }
  playAnime(media, ep, true)
  media = null
}

export function setStatus (status, other = {}, media) {
  const fuzzyDate = Helper.getFuzzyDate(media, status)
  const variables = {
    id: media.id,
    idMal: media.idMal,
    status,
    score: media.mediaListEntry?.score || 0,
    repeat: media.mediaListEntry?.repeat || 0,
    ...fuzzyDate,
    ...other
  }
  return Helper.entry(media, variables)
}

const episodeMetadataMap = {}

export async function getEpisodeMetadataForMedia (media) {
  if (episodeMetadataMap[media?.id]) return episodeMetadataMap[media?.id]
  const { episodes } = await getAniMappings(media?.id) || {}
  episodeMetadataMap[media?.id] = episodes
  return episodes
}

export function episode(media, variables) {
  const entry = variables?.hideSubs && animeSchedule.dubAiring.value?.find(entry => entry.media?.media?.id === media.id)
  const nodes = variables?.hideSubs ? entry?.media?.media?.airingSchedule?.nodes : media?.airingSchedule?.nodes

  if (!nodes || nodes.length === 0) return `Episode 1 in`
  if (entry?.delayedIndefinitely && nodes[0]) return `Episode ${nodes[0].episode} is`
  if (nodes.length === 1) return `Episode ${nodes[0].episode} in`

  let firstEpisode = nextAiring(nodes, variables)?.episode
  let lastEpisode = nodes[0].episode
  for (let i = 1; i < nodes.length; i++) {
    if (new Date(nodes[i].airingAt).getTime() !== new Date(nodes[i - 1].airingAt).getTime() && new Date(variables?.hideSubs ? nodes[i].airingAt : (nodes[i].airingAt * 1000)) > new Date() && new Date(variables?.hideSubs ? nodes[i].airingAt : (nodes[i - 1].airingAt * 1000)) > new Date()) {
      lastEpisode = nodes[i - 1].episode
      break
    }
    if (i === nodes.length - 1) lastEpisode = nodes[i].episode
  }

  return `Episode ${firstEpisode === lastEpisode ? `${firstEpisode}` : `${firstEpisode} ~ ${lastEpisode}`} in`
}

export function airingAt(media, variables) {
  if (variables?.hideSubs) {
    const entry = animeSchedule.dubAiring.value.find((entry) => entry.media?.media?.id === media.id)
    if (entry?.delayedIndefinitely) return 'Suspended'
    const airingAt = nextAiring(entry?.media?.media?.airingSchedule?.nodes, variables)?.airingAt
    return airingAt ? countdown((new Date(airingAt).getTime() / 1000) - Date.now() / 1000) : null
  }
  const airingAt = nextAiring(media.airingSchedule?.nodes, variables)?.airingAt
  return airingAt ? countdown( (new Date(airingAt).getTime()) - Date.now() / 1000) : null
}

export function nextAiring(nodes, variables) {
  const currentTime = new Date()
  return nodes?.filter(node => new Date(variables?.hideSubs ? node.airingAt : (node.airingAt * 1000)) > currentTime)?.sort((a, b) => a.airingAt - b.airingAt)?.shift()
}


const concurrentRequests = new Map()
export async function getKitsuMappings(anilistID) {
  if (!anilistID) return
  debug(`Searching for kitsu mappings for anilist media: ${anilistID}`)
  const cachedEntry = cache.cachedEntry(caches.MAPPINGS, `kitsu-${anilistID}`)
  if (cachedEntry) return cachedEntry
  if (concurrentRequests.has(`kitsu-${anilistID}`)) return concurrentRequests.get(`kitsu-${anilistID}`)
  const requestPromise = (async () => {
    let res = {}
    try {
      res = await fetch(`https://kitsu.io/api/edge/mappings?filter[externalSite]=anilist/anime&filter[externalId]=${anilistID}&include=item`)
    } catch (e) {
      if (!res || res.status !== 404) throw e
    }
    if (!res.ok && (res.status === 429 || res.status === 500)) {
      throw res
    }
    let json = null
    try {
      json = await res.json()
    } catch (error) {
      if (res.ok) printError(error)
    }
    if (!res.ok) {
      if (json) {
        for (const error of json?.errors || []) {
          printError(error)
        }
      } else {
        printError(res)
      }
    }
    return cache.cacheEntry(caches.MAPPINGS, `kitsu-${anilistID}`, {}, json, Date.now() + getRandomInt(1440, 2160) * 60 * 1000)
  })().finally(() => {
    concurrentRequests.delete(`kitsu-${anilistID}`)
  })
  concurrentRequests.set(`kitsu-${anilistID}`, requestPromise)
  return requestPromise
}

export async function getAniMappings(anilistID) {
  if (!anilistID) return
  debug(`Searching for ani mappings for anilist media: ${anilistID}`)
  const cachedEntry = cache.cachedEntry(caches.MAPPINGS, `ani-${anilistID}`)
  if (cachedEntry) return cachedEntry
  if (concurrentRequests.has(`ani-${anilistID}`)) return concurrentRequests.get(`ani-${anilistID}`)
  const requestPromise = (async () => {
    let res = {}
    try {
      res = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistID}`)
    } catch (e) {
      if (!res || res.status !== 404) throw e
    }
    if (!res.ok && (res.status === 429 || res.status === 500)) {
      throw res
    }
    let json = null
    try {
      json = await res.json()
    } catch (error) {
      if (res.ok) printError(error)
    }
    if (!res.ok) {
      if (json) {
        for (const error of json?.errors || []) {
          printError(error)
        }
      } else {
        printError(res)
      }
    }
    return cache.cacheEntry(caches.MAPPINGS, `ani-${anilistID}`, {}, json, Date.now() + getRandomInt(1440, 2160) * 60 * 1000)
  })().finally(() => {
    concurrentRequests.delete(`ani-${anilistID}`)
  })
  concurrentRequests.set(`ani-${anilistID}`, requestPromise)
  return requestPromise
}

function printError(error) {
  debug(`Error: ${error.status || 429} - ${error.message || codes[error.status || 429]}`)
  if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
    toast.error('Search Failed', {
      description: `Failed to fetch the anime mappings!\n${error.status || 429} - ${error.message || codes[error.status || 429]}`,
      duration: 3000
    })
  }
}
