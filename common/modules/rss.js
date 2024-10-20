import { DOMPARSER } from '@/modules/util.js'
import { settings, profiles, alToken, malToken } from '@/modules/settings.js'
import { toast } from 'svelte-sonner'
import { add } from '@/modules/torrent.js'
import { getEpisodeMetadataForMedia } from '@/modules/anime.js'
import AnimeResolver from '@/modules/animeresolver.js'
import { anilistClient } from '@/modules/anilist.js'
import { hasNextPage } from '@/modules/sections.js'
import { malDubs } from '@/modules/animedubs.js'
import { writable, get } from "svelte/store"
import IPC from '@/modules/ipc.js'
import Debug from '@/modules/debug.js'

const debug = Debug('ui:rss')

let fallbackNotify = JSON.parse(localStorage.getItem('rssNotify'))
const currentProfile = writable(alToken || malToken)
profiles.subscribe(() => {
  currentProfile.set(alToken || malToken)
})

export function parseRSSNodes (nodes) {
  return nodes.map(item => {
    const pubDate = item.querySelector('pubDate')?.textContent

    return {
      title: item.querySelector('title')?.textContent || '?',
      link: item.querySelector('enclosure')?.attributes.url.value || item.querySelector('link')?.textContent || '?',
      seeders: item.querySelector('seeders')?.textContent ?? '?',
      leechers: item.querySelector('leechers')?.textContent ?? '?',
      downloads: item.querySelector('downloads')?.textContent ?? '?',
      size: item.querySelector('size')?.textContent ?? '?',
      date: pubDate && new Date(pubDate)
    }
  })
}

const rssmap = {
  SubsPlease: settings.value.toshoURL + 'rss2?qx=1&q="[SubsPlease] "',
  'Erai-raws [Multi-Sub]': settings.value.toshoURL + 'rss2?qx=1&q="[Erai-raws] "',
  'Yameii [Dubbed]': settings.value.toshoURL + 'rss2?qx=1&q="[Yameii] "',
  'Judas [Small Size]': settings.value.toshoURL + 'rss2?qx=1&q="[Judas] "'
}
export function getReleasesRSSurl (val) {
  const rss = rssmap[val] || val
  return rss && new URL(rssmap[val] ? `${rss}${settings.value.rssQuality ? `"${settings.value.rssQuality}"` : ''}` : rss)
}

export async function getRSSContent (url) {
  if (!url) return null
  const res = await fetch(url)
  if (!res.ok) {
    debug(`Failed to fetch RSS feed: ${res.statusText}`)
    throw new Error(res.statusText)
  }
  return DOMPARSER(await res.text(), 'text/xml')
}

class RSSMediaManager {
  constructor () {
    this.resultMap = {}
  }

  getMediaForRSS (page, perPage, url, ignoreErrors) {
    const res = this._getMediaForRSS(page, perPage, url)
    if (!ignoreErrors) {
      res.catch(e => {
        toast.error('Search Failed', {
          description: 'Failed to load media for home feed!\n' + e.message
        })
        debug('Failed to load media for home feed', e.stack)
      })
    }
    return Array.from({ length: perPage }, (_, i) => ({ type: 'episode', data: this.fromPending(res, i) }))
  }

  async fromPending (result, i) {
    const array = await result
    return array[i]
  }

  async getContentChanged (page, perPage, url) {
    const content = await getRSSContent(getReleasesRSSurl(url))

    if (!content) return false

    const pubDate = +(new Date(content.querySelector('pubDate').textContent)) * page * perPage
    const pullDate = +(new Date(content.querySelector('pubDate').textContent))
    if (this.resultMap[url]?.date === pubDate) return false
    return { content, pubDate, pullDate }
  }

  async _getMediaForRSS (page, perPage, url) {
    debug(`Getting media for RSS feed ${url} page ${page} perPage ${perPage}`)
    const changed = await this.getContentChanged(page, perPage, url)
    if (!changed) return this.resultMap[url].result
    debug(`Feed ${url} has changed, updating`)

    const mainProfile = get(currentProfile)
    const index = (page - 1) * perPage
    const targetPage = [...changed.content.querySelectorAll('item')].slice(index, index + perPage)
    const items = parseRSSNodes(targetPage)
    hasNextPage.value = items.length === perPage
    const result = this.structureResolveResults(items)

    await this.findNewReleasesAndNotify(result,  mainProfile?.viewer?.data?.Viewer?.rssNotify?.[url]?.date || fallbackNotify?.[url]?.date);
    (mainProfile?.viewer?.data?.Viewer?.rssNotify ?? (fallbackNotify ??= {}))[url] = { date: changed.pullDate }
    localStorage.setItem(mainProfile ? (alToken ? 'ALviewer' : 'MALviewer') : 'rssNotify', JSON.stringify(mainProfile || fallbackNotify))

    this.resultMap[url] = {
      date: changed.pubDate,
      result
    }
    return result
  }

  async findNewReleasesAndNotify (results, oldDate) {
    if (!oldDate) return

    const res = await Promise.all(await results)
    const newReleases = res.filter(({ date }) => date?.getTime() > oldDate)
    debug(`Found ${newReleases?.length} new releases, notifying...`)

    for (const { media, parseObject, episode, date } of newReleases) {
      const notify = (!media?.mediaListEntry && settings.value.rssNotify?.includes("NOTONLIST")) || (media?.mediaListEntry && settings.value.rssNotify?.includes(media?.mediaListEntry?.status))
      const dubbed = malDubs.isDubMedia(parseObject)
      if (notify && (!settings.value.rssNotifyDubs || dubbed || !malDubs.isDubMedia(media))) {
        const options = {
          title: anilistClient.title(media) || parseObject.anime_title,
          body: `${episode ? `Episode ${episode}` : media?.format === 'MOVIE' ? `The Movie` : parseObject?.anime_title?.match(/S(\d{2})/) ? `Season ${parseInt(parseObject.anime_title.match(/S(\d{2})/)[1], 10)}` : `Batch`} (${dubbed ? "Dub" : "Sub"}) ${episode || media?.format === 'MOVIE' ? `is out!` : `is now ready to binge!`}`,
          icon: media?.coverImage.large || media?.coverImage.medium,
          data: {id: media?.id}
        }
        IPC.emit('notification', options)
      }
    }
  }

  async structureResolveResults (items) {
    const results = await AnimeResolver.resolveFileAnime(items.map(item => item.title))
    return results.map(async (result, i) => {
      const res = {
        ...result,
        episodeData: undefined,
        date: undefined,
        onclick: undefined
      }
      if (res.media?.id) {
        try {
          res.episodeData = (await getEpisodeMetadataForMedia(res.media))?.[res.episode]
        } catch (e) {
          debug(`Warn: failed fetching episode metadata for ${res.media.title?.userPreferred} episode ${res.episode}: ${e.stack}`)
        }
      }
      res.date = items[i].date
      res.onclick = () => add(items[i].link)
      return res
    })
  }
}

export const RSSManager = new RSSMediaManager()
