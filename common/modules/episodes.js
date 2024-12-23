import { toast } from 'svelte-sonner'
import { codes } from '@/modules/anilist.js'
import { caches, settings, updateCache } from '@/modules/settings.js'
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
        minTime: 300
    })

    rateLimitPromise = null
    concurrentRequests = new Map()

    constructor() {
        this.limiter.on('failed', async (error) => {
            if (error.status === 500) return 1

            if (!error.statusText) {
                if (!this.rateLimitPromise) this.rateLimitPromise = sleep(61 * 1000).then(() => { this.rateLimitPromise = null })
                return 61 * 1000
            }
            const time = ((error.headers.get('retry-after') || 60) + 1) * 1000
            if (!this.rateLimitPromise) this.rateLimitPromise = sleep(time).then(() => { this.rateLimitPromise = null })
            return time
        })
    }

    async getEpisodeData(idMal) {
        let page = 1
        const res = await this.requestEpisodes(idMal, page)
        return res.data.map(e => ({
            filler: e.filler,
            recap: e.recap,
            episode_id: e.mal_id, // mal_id is the episode_id in the v4 API very stupid
            title: e.title || e.title_romanji || e.title_japanese,
            aired: e.aired,
        })) || []
    }

    async getSingleEpisode(idMal, episode) {
        const res = await this.requestEpisodes(idMal, Number(episode) !== 0 ? episode : 1)
        const singleEpisode = res.data.find(e => (e.mal_id === episode) || (e.mal_id === Number(episode)))
        return singleEpisode ? {
            filler: singleEpisode.filler,
            recap: singleEpisode.recap,
            episode_id: singleEpisode.mal_id, // mal_id is the episode_id in the v4 API very stupid
            title: singleEpisode.title || singleEpisode.title_romanji || singleEpisode.title_japanese,
            aired: singleEpisode.aired
        } : []
    }

    async requestEpisodes(idMal, episode) {
        const page = Math.ceil(episode / 100)
        const cachedEntry = caches.value['episodes'][`${idMal}:${page}`]
        if (cachedEntry && Date.now() < cachedEntry.expiry) return cachedEntry.data
        if (this.concurrentRequests.has(`${idMal}:${page}`)) return this.concurrentRequests.get(`${idMal}:${page}`)
        const requestPromise = this.limiter.wrap(async () => {
            await this.rateLimitPromise
            debug(`Fetching Episode ${episode} for ${idMal} with Page ${page}`)
            let res = {}
            try {
                res = await fetch(`https://api.jikan.moe/v4/anime/${idMal}/episodes?page=${page}`)
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
                        this.printError(error)
                    }
                } else {
                    this.printError(res)
                }
            }
            updateCache('episodes', `${idMal}:${page}`, { data: await json, expiry: Date.now() + getRandomInt(5, 7) * 24 * 60 * 60 * 1000 })
            return caches.value['episodes'][`${idMal}:${page}`].data
        })().finally(() => {
            this.concurrentRequests.delete(`${idMal}:${page}`)
        })
        this.concurrentRequests.set(`${idMal}:${page}`, requestPromise)
        return requestPromise
    }

    printError(error) {
        debug(`Error: ${error.status || 429} - ${error.message || codes[error.status || 429]}`)
        if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
            toast.error('Episode Fetching Failed', {
                description: `Failed to fetch anime episodes!\n${error.status || 429} - ${error.message || codes[error.status || 429]}`,
                duration: 3000
            })
        }
    }
}

export const episodesList = new Episodes()