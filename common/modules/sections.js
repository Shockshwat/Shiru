import { anilistClient, currentSeason, currentYear } from '@/modules/anilist.js'
import { animeSchedule } from '@/modules/animeschedule.js'
import { malDubs } from '@/modules/animedubs.js'
import { writable } from 'simple-store-svelte'
import { settings } from '@/modules/settings.js'
import { RSSManager } from '@/modules/rss.js'
import Helper from '@/modules/helper.js'
import Debug from 'debug'

const debug = Debug('ui:sections')

export const hasNextPage = writable(true)

const hideStatus = ['CURRENT', 'REPEATING', 'COMPLETED', 'DROPPED']
const hideMyAnime = settings.value.hideMyAnime
const format = ['TV', 'MOVIE']
const status_not = ['NOT_YET_RELEASED', 'CANCELLED']

export default class SectionsManager {
  constructor (data = []) {
    this.sections = []
    for (const section of data) this.add(section)
  }

  /**
   * @param {object} data
   */
  add (data) {
    if (!data) return
    const { title, variables = {}, type, load = SectionsManager.createFallbackLoad(variables, type), preview = writable() } = data
    const section = { ...data, load, title, preview, variables }
    this.sections.push(section)
    return section
  }

  static createFallbackLoad (variables, type) {
    return (page = 1, perPage = 50, search = variables) => {
      const hideSubs = search.hideSubs ? { idMal: malDubs.dubLists.value.dubbed } : {}
      const res = (search.hideMyAnime && Helper.isAuthorized()) ? Helper.userLists(search).then(res => {
        if (!res?.data && res?.errors) throw res.errors[0]
        // anilist queries do not support mix and match, you have to use the same id includes as excludes, id_not_in cannot be used with idMal_in.
        const hideMyAnime = Helper.isAniAuth() ? { [Object.keys(hideSubs).length > 0 ? 'idMal_not' : 'id_not']: Array.from(new Set(res.data.MediaListCollection.lists.filter(({ status }) => search.hideStatus.includes(status)).flatMap(list => list.entries.map(({ media }) => (Object.keys(hideSubs).length > 0 ? media.idMal : media.id))))) }
              : {idMal_not: res.data.MediaList.filter(({ node }) => search.hideStatus.includes(Helper.statusMap(node.my_list_status.status))).map(({ node }) => node.id)}
        return anilistClient.search({ page, perPage, ...hideSubs, ...hideMyAnime, ...SectionsManager.sanitiseObject(search) })
      }) : anilistClient.search({ page, perPage, ...hideSubs, ...SectionsManager.sanitiseObject(search) })
      return SectionsManager.wrapResponse(res, perPage, type)
    }
  }

  static wrapResponse (res, length, type) {
    res.then(res => {
      hasNextPage.value = res?.data?.Page.pageInfo.hasNextPage
    })
    return Array.from({ length }, (_, i) => ({ type, data: SectionsManager.fromPending(res, i) }))
  }

  static async fromPending (arr, i) {
    const { data, errors } = await arr
    if (!data && errors) throw errors[0]
    return data?.Page.media[i]
  }

  static sanitiseObject = Helper.sanitiseObject
}

// list of all possible home screen sections
export let sections = []

//settings.subscribe(() => { // need a better method for this as this just doesn't work, horrible implementation.
  for (const section of sections) clearInterval(section.interval)
  sections = createSections()
//})

function createSections () {
  const sectionFormat = (title) => (settings.value.homeSections.find(([t]) => t === title)?.[2] || [])
  const createSection = (section, variables = {}, staticSort) => ({ ...section, ...(section.sort && staticSort ? { sort: 'N/A' } : {}), variables: { ...variables, sort: settings.value.homeSections.find(([t]) => !staticSort && t === section.title)?.[1] ?? section.sort, ...(Array.isArray(sectionFormat(section.title)) && sectionFormat(section.title).length > 0 ? { format : sectionFormat(section.title) } : {}) } })

  return [
  // RSS feeds
    ...settings.value.rssFeedsNew.map(([title, url]) => {
      const section = {
        title,
        sort: 'N/A',
        format: ['N/A'],
        load: (page = 1, perPage = 12) => RSSManager.getMediaForRSS(page, perPage, url),
        preview: writable(RSSManager.getMediaForRSS(1, 12, url)),
        variables: { disableSearch: true },
        isRSS: true
      }

      // update every 30 seconds
      section.interval = setInterval(async () => {
        try {
          if (await RSSManager.getContentChanged(1, 12, url)) {
            section.preview.value = RSSManager.getMediaForRSS(1, 12, url, true)
          }
        } catch (error) {
          debug(`Failed to update RSS feed for ${url} at the scheduled interval, this is likely a temporary connection issue: ${JSON.stringify(error)}`)
        }
      }, 30000)

      return section
    }),
    // official episode releases section
      ...['Dubbed Releases', 'Subbed Releases', ...(settings.value.adult === 'hentai' ? ['Hentai Releases'] : [])].map((title) => {
      const type = title.includes('Subbed') ? 'Sub' : title.includes('Dubbed') ? 'Dub' : 'Hentai'
      const section = {
        title,
        sort: 'N/A',
        format: !title.includes('Hentai') ? ['TV', 'MOVIE', 'OVA', 'ONA'] : ['OVA'],
        variables: { disableSearch: true },
        isRSS: true,
        load: (page = 1, perPage = 50) => animeSchedule.getMediaForRSS(page, perPage, type),
        preview: writable(animeSchedule.getMediaForRSS(1, 50, type)),
      }

      // update every 30 seconds
      section.interval = setInterval(async () => {
        try {
          if (await animeSchedule.feedChanged(type)) {
            section.preview.set(animeSchedule.getMediaForRSS(1, 50, type))
          }
        } catch (error) {
          debug(`Failed to update ${title} feed at the scheduled interval, this is likely a temporary connection issue: ${JSON.stringify(error)}`)
        }
      }, 30000)

      return section
    }),
    // user specific sections
    createSection({ title: 'Sequels You Missed', sort: 'POPULARITY_DESC', format: [], hide: !Helper.isAuthorized() || Helper.isMalAuth(),
      load: (page = 1, perPage = 50, variables = {}) => {
        if (Helper.isMalAuth()) return {} // not going to bother handling this, see below.
        const res = Helper.userLists(variables).then(res => {
          if (!res?.data && res?.errors) throw res.errors[0]
          const mediaList = res.data.MediaListCollection.lists.find(({ status }) => status === 'COMPLETED')?.entries
          const excludeIds = res.data.MediaListCollection.lists.reduce((filtered, { status, entries }) => { return (['CURRENT', 'REPEATING', 'COMPLETED', 'DROPPED', 'PAUSED'].includes(status)) ? filtered.concat(entries) : filtered}, []).map(({ media }) => media.id) || []
          if (!mediaList) return {}
          const ids = mediaList.flatMap(({ media }) => {
            return media.relations.edges.filter(edge => edge.relationType === 'SEQUEL')
          }).map(({ node }) => node.id)
          if (!ids.length) return {}
          return anilistClient.searchIDS({ page, perPage, id: ids, id_not: excludeIds, ...SectionsManager.sanitiseObject(variables), status: ['FINISHED', 'RELEASING'] })
        })
        return SectionsManager.wrapResponse(res, perPage)
      } // disable this section when authenticated with MyAnimeList. API for userLists fail to return relations and likely will never be fixed on their end.
    }, { userList: true, missedList: true, disableHide: true }),
    createSection({ title: 'Stories You Missed', sort: 'POPULARITY_DESC', format: [], hide: !Helper.isAuthorized() || Helper.isMalAuth(),
      load: (page = 1, perPage = 50, variables = {}) => {
        if (Helper.isMalAuth()) return {} // same as Sequels You Missed
        const res = Helper.userLists(variables).then(res => {
          if (!res?.data && res?.errors) throw res.errors[0]
          const mediaList = res.data.MediaListCollection.lists.find(({ status }) => status === 'COMPLETED')?.entries
          const excludeIds = res.data.MediaListCollection.lists.reduce((filtered, { status, entries }) => { return (['CURRENT', 'REPEATING', 'COMPLETED', 'DROPPED', 'PAUSED'].includes(status)) ? filtered.concat(entries) : filtered}, []).map(({ media }) => media.id) || []
          if (!mediaList) return {}
          const ids = mediaList.flatMap(({ media }) => {
            return media.relations.edges.filter(edge => !['SEQUEL', 'CHARACTER', 'OTHER'].includes(edge.relationType))
          }).map(({ node }) => node.id)
          if (!ids.length) return {}
          return anilistClient.searchIDS({ page, perPage, id: ids, id_not: excludeIds, ...SectionsManager.sanitiseObject(variables), status: ['FINISHED', 'RELEASING'] })
        })
        return SectionsManager.wrapResponse(res, perPage)
      } // disable this section when authenticated with MyAnimeList. API for userLists fail to return relations and likely will never be fixed on their end.
    }, { userList: true, missedList: true, disableHide: true }),
    createSection({ title: 'Continue Watching', sort: 'UPDATED_TIME_DESC', format: [], hide: !Helper.isAuthorized(),
      load: (page = 1, perPage = 50, variables = {}) => {
        const res = Helper.userLists(variables).then(res => {
          if (!res?.data && res?.errors) throw res.errors[0]
          let mediaList = Helper.isAniAuth() ? res.data.MediaListCollection.lists.reduce((filtered, { status, entries }) => {
            return (status === 'CURRENT' || status === 'REPEATING') ? filtered.concat(entries) : filtered
          }, []) : res.data.MediaList.filter(({ node }) => (node.my_list_status.status === Helper.statusMap('CURRENT') || node.my_list_status.is_rewatching))
          if (!mediaList) return {}
          return animeSchedule.dubAiringLists.value.then(airing => {
            if (settings.value.rssNotifyDubs) {
              const ids = []
              mediaList.forEach(watchMedia => {
                const media = watchMedia?.media || watchMedia?.node
                const matchingAiring = airing?.find(item => (watchMedia?.media ? item?.media?.media?.id : item?.media?.media?.idMal) === media?.id)
                if (matchingAiring && (media?.mediaListEntry || media?.my_list_status)) {
                  const episodeNumber = new Date(matchingAiring?.media?.media?.airingSchedule?.nodes?.[0]?.airingAt) > new Date() ? (matchingAiring?.media?.media?.airingSchedule?.nodes?.[0]?.episode - 1) : matchingAiring?.media?.media?.airingSchedule?.nodes?.[0]?.episode
                  if (((media?.mediaListEntry?.progress || media?.my_list_status?.num_episodes_watched) >= episodeNumber) && ((media?.status === 'RELEASING' || media?.status === 'currently_airing') || !((media?.mediaListEntry?.progress || media?.my_list_status?.num_episodes_watched) >= media?.num_episodes))) ids.push(media?.id)
                }
              })
              mediaList = mediaList.filter(media => {
                return !ids.includes(media?.media?.id || media?.node?.id)
              })
            }
            return animeSchedule.subAiringLists.value.then(airing => {
              if (Helper.isMalAuth()) {
                const ids = []
                mediaList.forEach(watchMedia => {
                  const media = watchMedia?.node
                  if (media?.my_list_status) {
                    const matchingAiring = airing?.find(item => item?.idMal === media?.id)
                    const episodeNumber = new Date(matchingAiring?.airingSchedule?.nodes?.[0]?.airingAt * 1000) > new Date() ? (matchingAiring?.airingSchedule?.nodes?.[0]?.episode - 1) : matchingAiring?.airingSchedule?.nodes?.[0]?.episode
                    if (media?.my_list_status?.num_episodes_watched >= (episodeNumber || media?.num_episodes)) ids.push(media?.id)
                  }
                })
                mediaList = mediaList.filter(media => {
                  return !ids.includes(media?.media?.id || media?.node?.id)
                })
              }
              return Helper.getPaginatedMediaList(page, perPage, variables, mediaList)
            })
          })
        })
        return SectionsManager.wrapResponse(res, perPage)
      }
    }, { userList: true, continueWatching: true, disableHide: true, status_not }),
    createSection({ title: 'Watching List', sort: 'UPDATED_TIME_DESC', format: [], hide: !Helper.isAuthorized(),
      load: (page = 1, perPage = 50, variables = {}) => {
        const res = Helper.userLists(variables).then(res => {
          if (!res?.data && res?.errors) throw res.errors[0]
          const mediaList = Helper.isAniAuth()
            ? res.data.MediaListCollection.lists.find(({ status }) => status === 'CURRENT')?.entries
            : res.data.MediaList.filter(({ node }) => node.my_list_status.status === Helper.statusMap('CURRENT'))
          if (!mediaList) return {}
          return Helper.getPaginatedMediaList(page, perPage, variables, mediaList)
        })
        return SectionsManager.wrapResponse(res, perPage)
      }
    }, { userList: true, disableHide: true, status_not }),
    createSection({ title: 'Completed List', sort: 'UPDATED_TIME_DESC', format: [], hide: !Helper.isAuthorized(),
      load: (page = 1, perPage = 50, variables = {}) => {
        const res = Helper.userLists(variables).then(res => {
          if (!res?.data && res?.errors) throw res.errors[0]
          const mediaList = Helper.isAniAuth()
            ? res.data.MediaListCollection.lists.find(({ status }) => status === 'COMPLETED')?.entries
            : res.data.MediaList.filter(({ node }) => node.my_list_status.status === Helper.statusMap('COMPLETED'))
          if (!mediaList) return {}
          return Helper.getPaginatedMediaList(page, perPage, variables, mediaList)
        })
        return SectionsManager.wrapResponse(res, perPage)
      }
    }, { userList: true, completedList: true, disableHide: true, status_not }),
    createSection({ title: 'Planning List', sort: 'POPULARITY_DESC', format: [], hide: !Helper.isAuthorized(),
      load: (page = 1, perPage = 50, variables = {}) => {
        const res = Helper.userLists(variables).then(res => {
          if (!res?.data && res?.errors) throw res.errors[0]
          const mediaList = Helper.isAniAuth()
            ? res.data.MediaListCollection.lists.find(({ status }) => status === 'PLANNING')?.entries
            : res.data.MediaList.filter(({ node }) => node.my_list_status.status === Helper.statusMap('PLANNING'))
          if (!mediaList) return {}
          return Helper.getPaginatedMediaList(page, perPage, variables, mediaList)
        })
        return SectionsManager.wrapResponse(res, perPage)
      }
    }, { userList: true, planningList: true, disableHide: true, status_not }),
    createSection({ title: 'Paused List', sort: 'UPDATED_TIME_DESC', format: [], hide: !Helper.isAuthorized(),
      load: (page = 1, perPage = 50, variables = {}) => {
        const res = Helper.userLists(variables).then(res => {
          if (!res?.data && res?.errors) throw res.errors[0]
          const mediaList = Helper.isAniAuth()
            ? res.data.MediaListCollection.lists.find(({ status }) => status === 'PAUSED')?.entries
            : res.data.MediaList.filter(({ node }) => node.my_list_status.status === Helper.statusMap('PAUSED'))
          if (!mediaList) return {}
          return Helper.getPaginatedMediaList(page, perPage, variables, mediaList)
        })
        return SectionsManager.wrapResponse(res, perPage)
      }
    }, { userList: true, disableHide: true, status_not }),
    createSection({ title: 'Dropped List', sort: 'UPDATED_TIME_DESC', format: [], hide: !Helper.isAuthorized(),
      load: (page = 1, perPage = 50, variables = {}) => {
        const res = Helper.userLists(variables).then(res => {
          if (!res?.data && res?.errors) throw res.errors[0]
          const mediaList = Helper.isAniAuth()
            ? res.data.MediaListCollection.lists.find(({ status }) => status === 'DROPPED')?.entries
            : res.data.MediaList.filter(({ node }) => node.my_list_status.status === Helper.statusMap('DROPPED'))
          if (!mediaList) return {}
          return Helper.getPaginatedMediaList(page, perPage, variables, mediaList)
        })
        return SectionsManager.wrapResponse(res, perPage)
      }
    }, { userList: true, droppedList: true, disableHide: true, status_not }),
    // common, non-user specific sections
    createSection({ title: 'Popular This Season', sort: 'POPULARITY_DESC', format }, { season: currentSeason, year: currentYear, hideMyAnime, hideStatus, status_not }, true),
    createSection({ title: 'Trending Now', sort: 'TRENDING_DESC', format }, { hideMyAnime, hideStatus, status_not }, true),
    createSection({ title: 'All Time Popular', sort: 'POPULARITY_DESC', format }, { hideMyAnime, hideStatus, status_not }, true),
    ...settings.value.customSections.map(([title, genres, tags, genre_not, tags_not]) => createSection({ title, sort: 'TRENDING_DESC', format }, { ...(genres?.length > 0 ? { genre: genres } : {}), ...(tags?.length > 0 ? { tag: tags } : {}), hideMyAnime, hideStatus, status_not }))
  ]
}
