import lavenshtein from 'js-levenshtein'
import { writable } from 'simple-store-svelte'
import Bottleneck from 'bottleneck'

import { alToken, settings, caches, notify, updateCache, updateNotify } from '@/modules/settings.js'
import { malDubs } from '@/modules/animedubs.js'
import { toast } from 'svelte-sonner'
import { getRandomInt, sleep } from './util.js'
import Helper from '@/modules/helper.js'
import IPC from '@/modules/ipc.js'
import Debug from 'debug'

const debug = Debug('ui:anilist')

export const codes = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  406: 'Not Acceptable',
  408: 'Request Time-out',
  409: 'Conflict',
  410: 'Gone',
  412: 'Precondition Failed',
  413: 'Request Entity Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Time-out',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  509: 'Bandwidth Limit Exceeded',
  510: 'Not Extended',
  511: 'Network Authentication Required'
}

function printError (error) {
  debug(`Error: ${error.status || 429} - ${error.message || codes[error.status || 429]}`)
  if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
    toast.error('Search Failed', {
      description: `Failed making request to anilist!\nTry again in a minute.\n${error.status || 429} - ${error.message || codes[error.status || 429]}`,
      duration: 3000
    })
  }
}

const date = new Date()
export const currentSeason = ['WINTER', 'SPRING', 'SUMMER', 'FALL'][Math.floor((date.getMonth() / 12) * 4) % 4]
export const currentYear = date.getFullYear()

/**
 * @param {import('./al.d.ts').Media & {lavenshtein?: number}} media
 * @param {string} name
 */
function getDistanceFromTitle (media, name) {
  if (media) {
    const titles = Object.values(media.title).filter(v => v).map(title => lavenshtein(title.toLowerCase(), name.toLowerCase()))
    const synonyms = media.synonyms.filter(v => v).map(title => lavenshtein(title.toLowerCase(), name.toLowerCase()) + 2)
    const distances = [...titles, ...synonyms]
    media.lavenshtein = distances.reduce((prev, curr) => prev < curr ? prev : curr)
    return media
  }
}

const queryObjects = /* js */`
id,
idMal,
title {
  romaji,
  english,
  native,
  userPreferred
},
description(asHtml: false),
season,
seasonYear,
format,
status,
episodes,
duration,
averageScore,
genres,
tags {
  name,
  rank
},
isFavourite,
coverImage {
  extraLarge,
  medium,
  color
},
source,
countryOfOrigin,
isAdult,
bannerImage,
synonyms,
stats {
  scoreDistribution {
    score,
    amount
    }
},
nextAiringEpisode {
  timeUntilAiring,
  episode
},
trailer {
  id,
  site
},
streamingEpisodes {
  title,
  thumbnail
},
mediaListEntry {
  id,
  progress,
  repeat,
  status,
  customLists(asArray: true),
  score(format: POINT_10),
  startedAt {
    year,
    month,
    day
  },
  completedAt {
    year,
    month,
    day
  }
},
airingSchedule(page: 1, perPage: 1, notYetAired: true) {
  nodes {
    episode,
    airingAt
  }
},
relations {
  edges {
    relationType(version:2),
    node {
      id,
      type,
      format,
      seasonYear
    }
  }
}`

const queryComplexObjects = /* js */`
studios(sort: NAME, isMain: true) {
  nodes {
    name
  }
},
recommendations {
  edges {
    node {
      rating,
      mediaRecommendation {
        id
      }
    }
  }
}`

class AnilistClient {
  limiter = new Bottleneck({
    reservoir: 90,
    reservoirRefreshAmount: 90,
    reservoirRefreshInterval: 60 * 1000,
    maxConcurrent: 10,
    minTime: 100
  })

  rateLimitPromise = null

  /** @type {import('simple-store-svelte').Writable<ReturnType<AnilistClient['getUserLists']>>} */
  userLists = writable()

  userID = alToken

  /** @type {import('simple-store-svelte').Writable<Record<number, import('./al.d.ts').Media>>} */
  mediaCache = writable(caches.value['medias'])

  constructor () {
    debug('Initializing Anilist Client for ID ' + this.userID?.viewer?.data?.Viewer?.id)
    this.limiter.on('failed', async (error) => {
      printError(error)

      if (error.status === 500) return 1

      if (!error.statusText) {
        if (!this.rateLimitPromise) this.rateLimitPromise = sleep(61 * 1000).then(() => { this.rateLimitPromise = null })
        return 61 * 1000
      }
      const time = ((error.headers.get('retry-after') || 60) + 1) * 1000
      if (!this.rateLimitPromise) this.rateLimitPromise = sleep(time).then(() => { this.rateLimitPromise = null })
      return time
    })

    if (this.userID?.viewer?.data?.Viewer) {
      this.userLists.value = this.getUserLists({ sort: 'UPDATED_TIME_DESC' })
      this.findNewNotifications().catch((error) => debug(`Failed to get new anilist notifications at the scheduled interval, this is likely a temporary connection issue: ${JSON.stringify(error)}`))
      // update userLists every 15 mins
      setInterval(async () => {
        try {
          const updatedLists = await this.getUserLists({sort: 'UPDATED_TIME_DESC'})
          this.userLists.value = Promise.resolve(updatedLists) // no need to have userLists await the entire query process while we already have previous values, (it's awful to wait 15+ seconds for the query to succeed with large lists)
        } catch (error) {
          debug(`Failed to update user lists at the scheduled interval, this is likely a temporary connection issue: ${JSON.stringify(error)}`)
        }
      }, 1000 * 60 * 15)
      // check notifications every 5 mins
      setInterval(() => {
        this.findNewNotifications().catch((error) => debug(`Failed to get new anilist notifications at the scheduled interval, this is likely a temporary connection issue: ${JSON.stringify(error)}`))
      }, 1000 * 60 * 5)
    }
  }
  /** @type {(options: RequestInit) => Promise<any>} */
  handleRequest = this.limiter.wrap(async opts => {
    await this.rateLimitPromise
    let res = {}
    try {
      res = await fetch('https://graphql.anilist.co', opts)
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
    if (!res.ok && res.status !== 404) {
      if (json) {
        for (const error of json?.errors || []) {
          printError(error)
        }
      } else {
        printError(res)
      }
    }
    return json || res
  })

  /**
   * @param {string} query
   * @param {Record<string, any>} variables
   */
  alRequest (query, variables) {
    const vars =  {
      variables: {
        page: 1,
        perPage: 50,
        sort: 'TRENDING_DESC',
        ...variables
      }
    }
    if (vars?.variables?.sort === 'OMIT') { delete vars.variables.sort}

    /** @type {RequestInit} */
    const options = {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        query: query.replace(/\s/g, '').replaceAll('&nbsp;', ' '),
        ...vars
      })
    }
    if (variables?.token) options.headers.Authorization = variables.token
    else if (alToken?.token) options.headers.Authorization = alToken.token

    return this.handleRequest(options)
  }

  async alSearch (method) {
    const res = await this.searchName(method)
    const media = res.data.Page.media.map(media => getDistanceFromTitle(media, method.name))
    if (!media.length) return null
    return media.reduce((prev, curr) => prev.lavenshtein <= curr.lavenshtein ? prev : curr)
  }

  async findNewNotifications () {
    if (settings.value.aniNotify !== 'none') {
      debug('Checking for new AniList notifications')
      const res = await this.getNotifications()
      const notifications = res?.data?.Page?.notifications
      const lastNotified = notify.value['lastAni']
      const newNotifications = (lastNotified > 0) && notifications ? notifications.filter(({createdAt}) => createdAt > lastNotified) : []
      debug(`Found ${newNotifications?.length} new notifications`)
      for (const { media, episode, type, createdAt } of newNotifications) {
        if ((settings.value.aniNotify !== 'limited' || type !== 'AIRING') && media.type === 'ANIME' && media.format !== 'MUSIC' && (!settings.value.rssNotifyDubs || !malDubs.isDubMedia(media))) {
          const details = {
            title: media.title.userPreferred,
            message: type === 'AIRING' ? `${media.format !== 'MOVIE' ? `Episode ${episode}` : `The Movie`} (Sub) is out in Japan, it should be available soon.` : 'Was recently announced!',
            icon: media.coverImage.medium,
            heroImg: media?.bannerImage
          }
          if (settings.value.systemNotify) {
            IPC.emit('notification', {
              ...details,
              button: [
                {text: 'View Anime', activation: `shiru://anime/${media?.id}`},
              ],
              activation: {
                type: 'protocol',
                launch: `shiru://anime/${media?.id}`
              }
            })
          }
          window.dispatchEvent(new CustomEvent('notification-app', {
            detail: {
              ...details,
              id: media?.id,
              ...(type === 'AIRING' ? { episode: episode } : {}),
              timestamp: createdAt,
              format: media?.format,
              dub: false,
              click_action: (type === 'AIRING' ? 'PLAY' : 'VIEW')
            }
          }))
        }
      }
    }
    updateNotify('lastAni', Date.now() / 1000)
  }

  /**
   * @param {{key: string, title: string, year?: string, isAdult: boolean}[]} flattenedTitles
   **/
  async alSearchCompound (flattenedTitles) {
    debug(`Searching for ${flattenedTitles?.length} titles via compound search`)
    const cachedEntry = caches.value['compound'][JSON.stringify(flattenedTitles)]
    if (cachedEntry && Date.now() < cachedEntry.expiry) {
      debug(`Found cached compound search ${JSON.stringify(flattenedTitles)}`)
      return cachedEntry.data
    }

    if (!flattenedTitles.length) return []
    // isAdult doesn't need an extra variable, as the title is the same regardless of type, so we re-use the same variable for adult and non-adult requests
    /** @type {Record<`v${number}`, string>} */
    const requestVariables = flattenedTitles.reduce((obj, { title, isAdult }, i) => {
      if (isAdult && i !== 0) return obj
      obj[`v${i}`] = title
      return obj
    }, {})

    const queryVariables = flattenedTitles.reduce((arr, { isAdult }, i) => {
      if (isAdult && i !== 0) return arr
      arr.push(`$v${i}: String`)
      return arr
    }, []).join(', ')
    const fragmentQueries = flattenedTitles.map(({ year, isAdult }, i) => /* js */`
    v${i}: Page(perPage: 10) {
      media(type: ANIME, search: $v${(isAdult && i !== 0) ? i - 1 : i}, status_in: [RELEASING, FINISHED], isAdult: ${!!isAdult} ${year ? `, seasonYear: ${year}` : ''}) {
        ...med
      }
    }`)

    const query = /* js */`
    query(${queryVariables}) {
      ${fragmentQueries}
    }
    
    fragment&nbsp;med&nbsp;on&nbsp;Media {
      id,
      title {
        romaji,
        english,
        native
      },
      synonyms
    }`

    /**
     * @type {import('./al.d.ts').Query<Record<string, {media: import('./al.d.ts').Media[]}>>}
     * @returns {Promise<[string, import('./al.d.ts').Media][]>}
     * */
    const res = await this.alRequest(query, requestVariables)
    const data = caches.value['compound'][JSON.stringify(flattenedTitles)]?.data
    if (!res?.data) {
      if (!(data && Object.keys(await data).length > 0)) updateCache('compound', JSON.stringify(flattenedTitles), { data: res, expiry: Date.now() + getRandomInt(10, 15) * 1000 })
      return caches.value['compound'][JSON.stringify(flattenedTitles)]?.data
    }

    /** @type {Record<string, number>} */
    const searchResults = {}
    for (const [variableName, { media }] of Object.entries(res.data)) {
      if (!media.length) continue
      const titleObject = flattenedTitles[Number(variableName.slice(1))]
      if (searchResults[titleObject.key]) continue
      searchResults[titleObject.key] = media.map(media => getDistanceFromTitle(media, titleObject.title)).reduce((prev, curr) => prev.lavenshtein <= curr.lavenshtein ? prev : curr).id
    }

    const ids = Object.values(searchResults)
    const search = await this.searchIDS({ id: ids, perPage: 50, sort: 'OMIT' })
    const mappedResults = Object.entries(searchResults)?.map(([filename, id]) => [filename, search?.data?.Page?.media?.find(media => media.id === id)])
    if (mappedResults) updateCache('compound', JSON.stringify(flattenedTitles), { data: mappedResults, expiry: Date.now() + getRandomInt(60, 90) * 60 * 1000 })

    return caches.value['compound'][JSON.stringify(flattenedTitles)]?.data
  }

  async alEntry (lists, variables) {
    return await this.entry(variables)
  }

  async searchName (variables = {}) {
    debug(`Searching name for ${variables?.name}`)
    const query = /* js */` 
    query($page: Int, $perPage: Int, $sort: [MediaSort], $name: String, $status: [MediaStatus], $year: Int, $isAdult: Boolean) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
        },
        media(type: ANIME, search: $name, sort: $sort, status_in: $status, isAdult: $isAdult, format_not: MUSIC, seasonYear: $year) {
          ${queryObjects}${settings.value.queryComplexity === 'Complex' ? `, ${queryComplexObjects}` : ``}
        }
      }
    }`

    variables.isAdult = variables.isAdult ?? false

    /** @type {import('./al.d.ts').PagedQuery<{media: import('./al.d.ts').Media[]}>} */
    const res = await this.alRequest(query, variables)
    await this.updateMediaCache(res?.data?.Page?.media)

    return res
  }

  async searchIDSingle (variables) {
    debug(`Searching for ID: ${variables?.id}`)
    const query = /* js */` 
    query($id: Int) { 
      Media(id: $id, type: ANIME) {
        ${queryObjects}${settings.value.queryComplexity === 'Complex' ? `, ${queryComplexObjects}` : ``}
      }
    }`

    /** @type {import('./al.d.ts').Query<{Media: import('./al.d.ts').Media}>} */
    const res = await this.alRequest(query, {...variables, sort: 'OMIT'})

    await this.updateMediaCache([res?.data?.Media])

    return res
  }

  /** returns {import('./al.d.ts').PagedQuery<{media: import('./al.d.ts').Media[]}>} */
  async searchIDS (variables) {
    if (variables?.id?.length === 0) return
    variables.sort = variables.sort || 'OMIT'
    if (settings.value.adult === 'none') variables.isAdult = false
    if (settings.value.adult !== 'hentai') variables.genre_not = [ ...(variables.genre_not ? variables.genre_not : []), 'Hentai' ]

    debug(`Searching for IDs ${JSON.stringify(variables)}`)
    const cachedEntry = caches.value['searchIDS'][JSON.stringify(variables)]
    if (cachedEntry && Date.now() < cachedEntry.expiry) {
      debug(`Found cached IDs ${JSON.stringify(variables)}`)
      return cachedEntry.data
    }

    const query = /* js */` 
    query($id: [Int], $idMal: [Int], $id_not: [Int], $page: Int, $perPage: Int, $status: [MediaStatus], $onList: Boolean, $sort: [MediaSort], $search: String, $season: MediaSeason, $year: Int, $genre: [String], $genre_not: [String], $tag: [String], $format: [MediaFormat], $isAdult: Boolean) { 
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
        },
        media(id_in: $id, idMal_in: $idMal, id_not_in: $id_not, type: ANIME, status_in: $status, onList: $onList, search: $search, sort: $sort, season: $season, seasonYear: $year, genre_in: $genre, genre_not_in: $genre_not, tag_in: $tag, format_in: $format, isAdult: $isAdult) {
          ${queryObjects}${settings.value.queryComplexity === 'Complex' ? `, ${queryComplexObjects}` : ``}
        }
      }
    }`

    /** @type {Promise<import('./al.d.ts').PagedQuery<{media: import('./al.d.ts').Media[]}>>} */
    const res = await this.alRequest(query, variables)

    // prevent updating the cache if the request fails (usually only occurs when the api is down).
    if (res?.data?.Page?.media) {
      await this.updateMediaCache(res.data.Page.media)
      updateCache('searchIDS', JSON.stringify(variables), { data: res, expiry: Date.now() + getRandomInt(34, 46) * 60 * 1000 })
    }
    const data = caches.value['searchIDS'][JSON.stringify(variables)]?.data
    return data && Object.keys(await data).length > 0 ? data : res
  }

  /** returns {import('./al.d.ts').PagedQuery<{media: import('./al.d.ts').Media[]}>} */
  async searchAllIDS (variables) {
    if (variables?.id?.length === 0) return
    variables.sort = variables.sort || 'OMIT'
    debug(`Searching for (ALL) IDs ${JSON.stringify(variables)}`)
    const cachedEntry = caches.value['searchIDS'][JSON.stringify(variables)]
    if (cachedEntry && Date.now() < cachedEntry.expiry) {
      debug(`Found cached (ALL) IDs ${JSON.stringify(variables)}`)
      return cachedEntry.data
    }

    let fetchedIDS = []
    let currentPage = 1

    // cycle until all paged ids are resolved.
    let failedRes
    while (true) {
      const res = await this.searchIDS({ page: currentPage, perPage: 50, id: [...new Set(variables.id)], sort: variables.sort })
      if (!res?.data && res?.errors) { failedRes = res }
      if (res?.data?.Page.media) fetchedIDS = fetchedIDS.concat(res?.data?.Page.media)
      if (!res?.data?.Page.pageInfo.hasNextPage) break
      currentPage++
    }

    if (!failedRes) {
      updateCache('searchIDS', JSON.stringify(variables), {
        data: {
          data: {
            Page: {
              pageInfo: {
                hasNextPage: false
              },
              media: fetchedIDS
            }
          }
        }, expiry: Date.now() + getRandomInt(34, 46) * 60 * 1000
      })
    }

    const data = caches.value['searchIDS'][JSON.stringify(variables)]?.data
    return failedRes ? (data ? Promise.resolve(data) : failedRes) : Promise.resolve(data)
  }

  /** @returns {Promise<import('./al.d.ts').PagedQuery<{ notifications: { id: number, type: string, createdAt: number, episode: number, media: import('./al.d.ts').Media}[] }>>} */
  getNotifications (variables = {}) {
    debug('Getting notifications')
    const query = /* js */`
    query($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        notifications(resetNotificationCount: false, type_in: [AIRING, RELATED_MEDIA_ADDITION]) {
          ...on&nbsp;AiringNotification {
            id,
            type,
            episode,
            createdAt,
            media {
              id,
              idMal,
              type,
              format,
              title {
                userPreferred
              },
              coverImage {
                medium
              }
            }
          },
          ...on&nbsp;RelatedMediaAdditionNotification {
            id,
            type,
            createdAt,
            media {
              id,
              type,
              format,
              title {
                userPreferred
              },
              coverImage {
                medium
              }
            }
          }
        }
      }
    }`

    return this.alRequest(query, variables)
  }

  /** @returns {Promise<import('./al.d.ts').Query<{ Viewer: import('./al.d.ts').Viewer }>>} */
  viewer (variables = {}) {
    debug('Getting viewer')
    const query = /* js */` 
    query {
      Viewer {
        avatar {
          medium,
          large
        },
        name,
        id,
        mediaListOptions {
          animeList {
            customLists
          }
        }
      }
    }`

    return this.alRequest(query, variables)
  }

  /** @returns {Promise<import('./al.d.ts').Query<{ MediaListCollection: import('./al.d.ts').MediaListCollection }>>} */
  async getUserLists (variables = {}) {
    debug('Getting user lists')
    variables.id = !variables.userID ? this.userID?.viewer?.data?.Viewer.id : variables.userID
    variables.sort = variables.sort?.replace('USER_SCORE_DESC', 'SCORE_DESC') || 'UPDATED_TIME_DESC' // doesn't exist, AniList uses SCORE_DESC for both MediaSort and MediaListSort.
    const query = /* js */` 
      query($id: Int, $sort: [MediaListSort]) {
        MediaListCollection(userId: $id, type: ANIME, sort: $sort, forceSingleCompletedList: true) {
          lists {
            status,
            entries {
              media {
                ${queryObjects}${settings.value.queryComplexity === 'Complex' ? `, ${queryComplexObjects}` : ``}
              }
            }
          }
        }
      }`

    let res
    for (let attempt = 1; attempt <= 3; attempt++) { // large user lists can sometimes result in a timeout, typically trying again succeeds.
      res = await this.alRequest(query, variables)
      if (res?.data?.MediaListCollection) break
      if (attempt < 3) {
        debug(`Error fetching user lists, attempt ${attempt} failed. Retrying in 5 seconds...`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      } else {
        debug('Failed fetching user lists. Maximum of 3 attempts reached, giving up.')
      }
    }

    if (!variables.token) await this.updateMediaCache(res?.data?.MediaListCollection?.lists?.flatMap(list => list.entries.map(entry => entry.media)))
    // return the cached user lists if fetching fails. Better to keep old data than none at all.
    return res?.data?.MediaListCollection ? res : (this.userLists?.value && ((Object.keys(this.userLists.value).length > 0) || this.userLists.value.length > 0)) ? this.userLists.value : res
  }

  async updateListEntry(mediaId, listEntry) {
    const lists = (await this.userLists.value).data.MediaListCollection.lists?.map(list => { return { ...list, entries: list.entries.filter(entry => entry.media.id !== mediaId) } })
    let targetList = lists.find(list => list.status === listEntry?.status)
    if (!targetList) {
      targetList = { status: listEntry?.status, entries: [] }
      lists.push(targetList)
    }
    await this.updateMediaCache([{ ...this.mediaCache.value[mediaId], mediaListEntry: listEntry }])
    targetList.entries.unshift({ media: this.mediaCache.value[mediaId] })
    this.userLists.value = Promise.resolve({
      data: {
        MediaListCollection: {
          lists: lists
        }
      }
    })
  }

  async deleteListEntry(mediaId) {
    await this.updateMediaCache([{ ...this.mediaCache.value[mediaId], mediaListEntry: null }])
    this.userLists.value = Promise.resolve({
      data: {
        MediaListCollection: {
          lists: (await this.userLists.value)?.data?.MediaListCollection?.lists?.map(list => {
            return {...list, entries: list.entries.filter(entry => entry.media.id !== mediaId)}
          })
        }
      }
    })
  }

  /** @returns {Promise<import('./al.d.ts').Query<{ MediaList: { status: string, progress: number, repeat: number }}>>} */
  async searchIDStatus (variables = {}) {
    variables.id = this.userID?.viewer?.data?.Viewer.id
    variables.sort = variables.sort || 'OMIT'
    debug(`Searching for ID status: ${variables.id}`)
    const query = /* js */` 
      query($id: Int, $mediaId: Int) {
        MediaList(userId: $id, mediaId: $mediaId) {
          status,
          progress,
          repeat
        }
      }`

    return await this.alRequest(query, variables)
  }

  async searchAiringSchedule (variables = {}) {
    debug('Searching for airing schedule')
    variables.to = (variables.from + 7 * 24 * 60 * 60)
    const query = /* js */` 
    query($page: Int, $perPage: Int, $from: Int, $to: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
        },
        airingSchedules(airingAt_greater: $from, airingAt_lesser: $to) {
          episode,
          timeUntilAiring,
          airingAt,
          media {
            ${queryObjects}${settings.value.queryComplexity === 'Complex' ? `, ${queryComplexObjects}` : ``}
          }
        }
      }
    }`

    /** @type {import('./al.d.ts').PagedQuery<{ airingSchedules: { timeUntilAiring: number, airingAt: number, episode: number, media: import('./al.d.ts').Media}[]}>} */
    const res = await this.alRequest(query, variables)

    await this.updateMediaCache(res?.data?.Page?.airingSchedules?.map(({media}) => media))

    return res
  }

  /** @returns {Promise<import('./al.d.ts').PagedQuery<{ airingSchedules: { airingAt: number, episode: number }[]}>>} */
  async episodes (variables = {}) {
    debug(`Getting episodes for ${variables.id}`)

    const cachedEntry = caches.value['episodes'][variables.id]
    if (cachedEntry && Date.now() < cachedEntry.expiry) {
      debug(`Found cached episodes for ${variables.id}`)
      return cachedEntry.data
    }

    const query = /* js */` 
      query($id: Int) {
        Page(page: 1, perPage: 1000) {
          airingSchedules(mediaId: $id) {
            airingAt,
            episode
          }
        }
      }`

    updateCache('episodes', variables.id, { data: await this.alRequest(query, variables), expiry: Date.now() + getRandomInt(75, 100) * 60 * 1000 })
    return caches.value['episodes'][variables.id].data
  }

  async search (variables = {}) {
    if (settings.value.adult === 'none') variables.isAdult = false
    if (settings.value.adult !== 'hentai') variables.genre_not = [ ...(variables.genre_not ? variables.genre_not : []), 'Hentai' ]

    debug(`Searching ${JSON.stringify(variables)}`)
    const cachedEntry = caches.value['search'][JSON.stringify(variables)]
    if (cachedEntry && Date.now() < cachedEntry.expiry) {
      debug(`Found cached search ${JSON.stringify(variables)}`)
      return cachedEntry.data
    }

    const query = /* js */` 
    query($page: Int, $perPage: Int, $sort: [MediaSort], $search: String, $onList: Boolean, $status: [MediaStatus], $status_not: [MediaStatus], $season: MediaSeason, $year: Int, $genre: [String], $genre_not: [String], $tag: [String], $format: [MediaFormat], $id_not: [Int], $idMal_not: [Int], $idMal: [Int], $isAdult: Boolean) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
        },
        media(id_not_in: $id_not, idMal_not_in: $idMal_not, idMal_in: $idMal, type: ANIME, search: $search, sort: $sort, onList: $onList, status_in: $status, status_not_in: $status_not, season: $season, seasonYear: $year, genre_in: $genre, genre_not_in: $genre_not, tag_in: $tag, format_in: $format, format_not: MUSIC, isAdult: $isAdult) {
          ${queryObjects}${settings.value.queryComplexity === 'Complex' ? `, ${queryComplexObjects}` : ``}
        }
      }
    }`

    /** @type {Promise<import('./al.d.ts').PagedQuery<{media: import('./al.d.ts').Media[]}>>} */
    const res = await this.alRequest(query, variables)

    // prevent updating the cache if the request fails (usually only occurs when the api is down).
    if (res?.data?.Page?.media) {
      await this.updateMediaCache(res.data.Page.media)
      updateCache('search', JSON.stringify(variables), { data: res, expiry: Date.now() + getRandomInt(16, 28) * 60 * 1000 })
    }

    const data = caches.value['search'][JSON.stringify(variables)]?.data
    return data && Object.keys(await data).length > 0 ? data : res
  }

  /** @returns {Promise<import('./al.d.ts').Query<{ AiringSchedule: { airingAt: number }}>>} */
  episodeDate (variables) {
    debug(`Searching for episode date: ${variables.id}, ${variables.ep}`)
    // need to implement cache
    const query = /* js */`
      query($id: Int, $ep: Int) {
        AiringSchedule(mediaId: $id, episode: $ep) {
          airingAt
        }
      }`

    return this.alRequest(query, variables)
  }

  /** @returns {Promise<import('./al.d.ts').PagedQuery<{ mediaList: import('./al.d.ts').Following[]}>>} */
  async following (variables) {
    debug('Getting following')
    const cachedEntry = caches.value['following'][JSON.stringify(variables)]
    if (cachedEntry && Date.now() < cachedEntry.expiry) {
      debug(`Found cached followers ${JSON.stringify(variables)}`)
      return cachedEntry.data
    }

    const query = /* js */`
      query($id: Int) {
        Page {
          mediaList(mediaId: $id, isFollowing: true, sort: UPDATED_TIME_DESC) {
            status,
            score,
            user {
              name,
              avatar {
                medium
              }
            }
          }
        }
      }`

    /** @type {Promise<import('./al.d.ts').PagedQuery<{ mediaList: import('./al.d.ts').Following[]}>>} */
    const res = await this.alRequest(query, variables)
    updateCache('following', JSON.stringify(variables), { data: res, expiry: Date.now() + getRandomInt(200, 300) * 60 * 1000 })
    return caches.value['following'][JSON.stringify(variables)].data
  }

  /** @returns {Promise<import('./al.d.ts').Query<{Media: import('./al.d.ts').Media}>>} */
  async recommendations (variables) {
    debug(`Getting recommendations for ${variables.id}`)

    if (settings.value.queryComplexity === 'Complex' && this.mediaCache.value[variables.id]) {
      debug(`Complex queries are enabled, returning cached recommendations from media ${variables.id}`)
      return {
        data: {
          Media: {
            ...this.mediaCache.value[variables.id]
          }
        }
      }
    }

    const cachedEntry = caches.value['recommendations'][variables.id]
    if (cachedEntry && Date.now() < cachedEntry.expiry) {
      debug(`Found cached recommendations for ${variables.id}`)
      return cachedEntry.data
    }

    const query = /* js */` 
      query($id: Int) {
        Media(id: $id, type: ANIME) {
          id,
          idMal,
          ${queryComplexObjects}
        }
      }`

    updateCache('recommendations', variables.id, { data: await this.alRequest(query, variables), expiry: Date.now() + getRandomInt(1500, 2000) * 60 * 1000 })
    return caches.value['recommendations'][variables.id].data
  }

  async entry (variables) {
    debug(`Updating entry for ${variables.id}`)
    const query = /* js */`
      mutation($lists: [String], $id: Int, $status: MediaListStatus, $episode: Int, $repeat: Int, $score: Int, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
        SaveMediaListEntry(mediaId: $id, status: $status, progress: $episode, repeat: $repeat, scoreRaw: $score, customLists: $lists, startedAt: $startedAt, completedAt: $completedAt) {
          id,
          status,
          progress,
          score,
          repeat,
          startedAt {
            year,
            month,
            day
          },
          completedAt {
            year,
            month,
            day
          }
        }
      }`

    const res = await this.alRequest(query, variables)
    if (!variables.token) await this.updateListEntry(variables.id, res?.data?.SaveMediaListEntry)
    return res
  }

  async delete (variables) {
    debug(`Deleting entry for ${variables.id}`)
    const query = /* js */`
      mutation($id: Int) {
        DeleteMediaListEntry(id: $id) {
          deleted
        }
      }`
    const res = await this.alRequest(query, variables)
    if (!variables.token) await this.deleteListEntry(variables.idAni)
    return res
  }

  favourite (variables) {
    debug(`Toggling favourite for ${variables.id}`)
    const query = /* js */`
      mutation($id: Int) {
        ToggleFavourite(animeId: $id) { anime { nodes { id } } } 
      }`

    return this.alRequest(query, variables)
  }

  customList (variables = {}) {
    debug('Updating custom list')
    const query = /* js */`
      mutation($lists: [String]) {
        UpdateUser(animeListOptions: { customLists: $lists }) {
          id
        }
      }`

    return this.alRequest(query, variables)
  }

  /** @param {import('./al.d.ts').Media} media */
  title(media) {
    const cachedMedia = this.mediaCache.value[media?.id] || media
    const preferredTitle = cachedMedia?.title.userPreferred
    if (alToken) {
      return preferredTitle
    }

    if (settings.value.titleLang === 'romaji') {
      return cachedMedia?.title.romaji || preferredTitle
    } else {
      return cachedMedia?.title.english || preferredTitle
    }
  }

  /** @param {import('./al.d.ts').Media} media */
  reviews(media) {
    const totalReviewers = media.stats?.scoreDistribution?.reduce((total, score) => total + score.amount, 0)
    return media.averageScore && totalReviewers ? totalReviewers.toLocaleString() : '?'
  }

  /** @param {import('./al.d.ts').Media[]} medias */
  async updateMediaCache(medias) {
    if (!medias) return
    if (!alToken) await Promise.all(medias.map(media => Helper.fillEntry(media))) // attach any alternative authorization userList information

    const updatedMedias = {}
    for (const media of medias) {
      if (media) {
        updatedMedias[media.id] = media
      }
    }

    caches.update((cache) => {
      if (!cache['medias']) cache['medias'] = {}
      cache['medias'] = { ...cache['medias'], ...updatedMedias }
      return cache
    })
    this.mediaCache.set(caches.value['medias'])
  }
}

export const anilistClient = new AnilistClient()
