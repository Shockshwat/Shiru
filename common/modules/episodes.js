import { toast } from 'svelte-sonner'
import { codes } from '@/modules/anilist.js'
import { settings } from '@/modules/settings.js'
import { cache, caches } from '@/modules/cache.js'
import { getKitsuMappings } from '@/modules/anime.js'
import { getRandomInt, sleep } from '@/modules/util.js'
import Bottleneck from 'bottleneck'
import Debug from 'debug'

const debug = Debug('ui:episodes')

/*
 * MAL Episode Information
 * Dub information is fetched from api.jikan.moe.
 */
class Episodes {
    limiter = new Bottleneck({
        reservoir: 60,
        reservoirRefreshAmount: 60,
        reservoirRefreshInterval: 60 * 1000,
        maxConcurrent: 3,
        minTime: 333
    })

    rateLimitPromise = null
    concurrentRequests = new Map()

    constructor() {
        this.limiter.on('failed', async (error) => {
            let info = (await error.json()) || error
            if (info.status === 500) return 1

            const time = ((error.headers.get('retry-after') || 2) + 1) * 1000
            if (!this.rateLimitPromise) this.rateLimitPromise = sleep(time).then(() => { this.rateLimitPromise = null })
            return time
        })
    }

    async getEpisodeData(idMal) {
        if (!idMal) return []
        let page = 1
        const res = await this.requestEpisodes(true, idMal, page)
        if (res && res.pagination?.has_next_page && res.pagination?.last_visible_page) {
            const lastRes = await this.requestEpisodes(true, idMal, res.pagination.last_visible_page * 100)
            const arr = lastRes.data.map(e => ({
                filler: e.filler,
                recap: e.recap,
                episode_id: e.mal_id, // mal_id is the episode_id in the v4 API very stupid
                title: e.title || e.title_romanji || e.title_japanese,
                aired: e.aired,
            }))
            return arr || []
        } else {
            return res?.data?.map(e => ({
                filler: e.filler,
                recap: e.recap,
                episode_id: e.mal_id, // mal_id is the episode_id in the v4 API very stupid
                title: e.title || e.title_romanji || e.title_japanese,
                aired: e.aired,
            })) || []
        }
    }

    async getSingleEpisode(idMal, episode) {
        if (!idMal) return []
        const res = await this.requestEpisodes(true, idMal, Number(episode || 1) !== 0 ? (episode || 1) : 1)
        const singleEpisode = res.data.find(e => (e.mal_id === episode) || (e.mal_id === Number(episode || 1)))
        return singleEpisode ? {
            filler: singleEpisode.filler,
            recap: singleEpisode.recap,
            episode_id: singleEpisode.mal_id, // mal_id is the episode_id in the v4 API very stupid
            title: singleEpisode.title || singleEpisode.title_romanji || singleEpisode.title_japanese,
            aired: singleEpisode.aired
        } : []
    }

    async getKitsuEpisodes(id) {
        const mappings = await getKitsuMappings(id)
        const kitsuId = mappings?.data?.[0]?.relationships?.data?.id || mappings?.included?.[0]?.id
        if (kitsuId) {
            return await this.requestEpisodes(false, kitsuId, 1)
        }
        return null
    }

    async getMedia(idMal) {
        if (!idMal) return []
        return await this.requestEpisodes(true, idMal, 1, true)
    }

    async requestEpisodes(jikan, id, episode, root) {
        const page = Math.ceil(episode / 100)
        const cachedEntry = cache.cachedEntry(caches.EPISODES, `${id}:${page}:${root}`)
        if (cachedEntry) return cachedEntry
        if (this.concurrentRequests.has(`${id}:${page}:${root}`)) return this.concurrentRequests.get(`${id}:${page}:${root}`)
        const requestPromise = this.limiter.wrap(async () => {
            await this.rateLimitPromise
            debug(`Fetching Episode ${episode} for ${id} with Page ${page}`)
            let res = {}
            try {
                res = await fetch(jikan ? `https://api.jikan.moe/v4/anime/${id}${!root ? `/episodes?page=${page}` : ``}` : `https://kitsu.io/api/edge/anime/${id}/episodes`)
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
                if (res.ok) this.printError(error)
            }
            if (!res.ok) {
                if (json) {
                    for (const error of json?.errors || []) {
                        this.printError(error, true)
                    }
                } else {
                    this.printError(res)
                }
            }
            return cache.cacheEntry(caches.EPISODES, `${id}:${page}:${root}`, {}, json, Date.now() + getRandomInt(1, 3) * 24 * 60 * 60 * 1000)
        })().finally(() => {
            this.concurrentRequests.delete(`${id}:${page}:${root}`)
        })
        this.concurrentRequests.set(`${id}:${page}:${root}`, requestPromise)
        return requestPromise
    }

    printError(error, silent) {
        debug(`Error: ${error.status || 429} - ${error.message || codes[error.status || 429]}`)
        if (!silent && (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors'))) {
            toast.error('Episode Fetching Failed', {
                description: `Failed to fetch anime episodes!\n${error.status || 429} - ${error.message || error.detail || codes[error.status || 429]}`,
                duration: 3000
            })
        }
    }
}

export const episodesList = new Episodes()