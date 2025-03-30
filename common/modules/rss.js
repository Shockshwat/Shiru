import { getRandomInt, DOMPARSER } from '@/modules/util.js'
import { settings } from '@/modules/settings.js'
import { cache, caches } from '@/modules/cache.js'
import { toast } from 'svelte-sonner'
import { add } from '@/modules/torrent.js'
import { getEpisodeMetadataForMedia } from '@/modules/anime.js'
import AnimeResolver from '@/modules/animeresolver.js'
import { anilistClient } from '@/modules/anilist.js'
import { hasNextPage } from '@/modules/sections.js'
import { malDubs } from '@/modules/animedubs.js'
import IPC from '@/modules/ipc.js'
import Debug from 'debug'

const debug = Debug('ui:rss')

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
  return rss && new URL(rssmap[val] ? `${rss}${settings.value.rssQuality ? `${settings.value.rssQuality}p|${settings.value.rssQuality}` : ''}` : rss)
}

export async function getRSSContent (url) {
  if (!url) return null
  try {
    let res = {}
    try {
      res = await fetch(url)
    } catch (e) {
      if (!res || res.status !== 404) throw e
    }
    if (!res.ok) {
      debug(`Failed to fetch RSS feed: ${res.statusText}`)
      throw new Error(res.statusText)
    }
    return DOMPARSER((await cache.cacheEntry(caches.RSS, `${btoa(url)}`, { mappings: true }, (await res)?.text(), Date.now() + getRandomInt(10, 15) * 60 * 1000)), 'text/xml')
  } catch (e) {
    const cachedEntry = cache.cachedEntry(caches.RSS, `${btoa(url)}`, true)
    if (cachedEntry) {
      debug(`Failed to request RSS feed for ${url}, this is likely due to an outage... falling back to cached data.`)
      return DOMPARSER(cachedEntry, 'text/xml')
    }
    else throw e
  }
}

class RSSMediaManager {
  constructor () {
    this.resultMap = {}
  }

  getMediaForRSS (page, perPage, url, ignoreErrors) {
    const res = this._getMediaForRSS(page, perPage, url)
    if (!ignoreErrors) {
      res.catch(e => {
        if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
          toast.error('Search Failed', {
            description: 'Failed to load media for home feed!\n' + e.message
          })
        }
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

    const index = (page - 1) * perPage
    const targetPage = [...changed.content.querySelectorAll('item')].slice(index, index + perPage)
    const items = parseRSSNodes(targetPage)
    hasNextPage.value = items.length === perPage
    const result = this.structureResolveResults(items)

    const encodedUrl = btoa(url)
    await this.findNewReleasesAndNotify(result, cache.getEntry(caches.NOTIFICATIONS, 'lastRSS')?.[encodedUrl]?.date)
    cache.setEntry(caches.NOTIFICATIONS, 'lastRSS', (current) => ({...current, [encodedUrl]: { date: changed.pullDate }}))

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

    for (const { media, parseObject, episode, link, date } of newReleases) {
      const notify = (!media?.mediaListEntry && settings.value.rssNotify?.includes('NOTONLIST')) || (media?.mediaListEntry && settings.value.rssNotify?.includes(media?.mediaListEntry?.status))
      const dubbed = malDubs.isDubMedia(parseObject)
      if (notify && (!settings.value.preferDubs || dubbed || !malDubs.isDubMedia(media))) {
        const progress = media?.mediaListEntry?.progress
        const behind = progress < (Number(episode) - 1)
        const details = {
          id: media?.id,
          title: anilistClient.title(media) || parseObject.anime_title,
          message: `${media?.format === 'MOVIE' ? `The Movie` : episode ? `${media?.episodes === Number(episode) ? `The wait is over! ` : ``}Episode ${Number(episode)}` : parseObject?.anime_title?.match(/S(\d{2})/) ? `Season ${parseInt(parseObject.anime_title.match(/S(\d{2})/)[1], 10)}` : `Batch`} (${dubbed ? 'Dub' : 'Sub'}) ${Number(episode) || media?.format === 'MOVIE' ? `is out${media?.format !== 'MOVIE' && media?.episodes === Number(episode) ? `, this season is now ready to binge` : ``}!` : `is now ready to binge!`}`,
          icon: media?.coverImage.medium,
          iconXL: media?.coverImage?.extraLarge,
          heroImg: media?.bannerImage || (media?.trailer?.id && `https://i.ytimg.com/vi/${media?.trailer?.id}/hqdefault.jpg`)
        }
        if (settings.value.systemNotify) {
          IPC.emit('notification', {
            ...details,
            button: [
              {
                text: `${!progress || progress === 0 ? 'Start Watching' : behind ? 'Continue Watching' : 'Watch Now'}`,
                activation: `${!progress || progress === 0 || behind ? 'shiru://search/' + media?.id : 'shiru://torrent/' + link}`
              },
              {
                text: 'View Anime',
                activation: `shiru://anime/${media?.id}`
              }
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
            episode: Number(episode) || (parseObject?.anime_title?.match(/S(\d{2})/) ? parseInt(parseObject.anime_title.match(/S(\d{2})/)[1], 10) : Number(episode)),
            timestamp: Math.floor(new Date(date).getTime() / 1000),
            format: media?.format,
            season: !episode && parseObject.anime_title.match(/S(\d{2})/),
            dub: dubbed,
            click_action: 'TORRENT',
            magnet: link
          }
        }))
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
        link: undefined,
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
      res.link = items[i].link
      res.onclick = () => add(items[i].link, { media: res.media, episode: res.episode })
      return res
    })
  }
}

export const RSSManager = new RSSMediaManager()
