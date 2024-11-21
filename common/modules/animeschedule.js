import { toast } from 'svelte-sonner'
import { writable } from 'simple-store-svelte'
import { anilistClient, codes } from '@/modules/anilist.js'
import Debug from '@/modules/debug.js'
import { settings, notify, updateNotify } from '@/modules/settings.js'
import { getEpisodeMetadataForMedia } from '@/modules/anime.js'
import { hasNextPage } from '@/modules/sections.js'
import IPC from '@/modules/ipc'

const debug = Debug('ui:animeschedule')

/*
 * AnimeSchedule.net (Dub Schedule)
 * Handles periodic fetching of the dub airing schedule which is based on timetables from animeschedule.net tokenized api access.
 */
class AnimeSchedule {
    airing = writable([])
    airingLists = writable()
    airedLists = writable()
    airedListsCache = writable({})

    constructor() {
        this.airingLists.value = this.getFeed('dub-schedule-resolved')
        this.findNewNotifications()

        //  update airingLists every 30 mins
        setInterval(() => {
            debug(`Updating dub airing schedule`)
            this.airingLists.value = this.getFeed('dub-schedule-resolved')
            this.findNewNotifications()
        }, 1000 * 60 * 30)

        // check notifications every 5 mins
        setInterval(() => this.findNewNotifications(), 1000 * 60 * 5)

        this.airingLists.subscribe(async value  => {
            this.airing.value = await value
        })
    }

    async findNewNotifications() {
        if (settings.value.dubNotify?.length > 0) {
            debug('Checking for new Dub Schedule notifications')
            const newNotifications = (await this.airingLists.value).map(entry => entry.media).filter(media => (media?.airingSchedule?.nodes?.[0]?.unaired && !notify.value['announcedDubs'].includes(media?.id)))
            await anilistClient.searchIDS({id: newNotifications.map(media => media.id)})
            debug(`Found ${newNotifications?.length} new dubbed notifications`)
            for (const media of newNotifications) {
                const cachedMedia = anilistClient.mediaCache.value[media?.id]
                const notify = (!cachedMedia?.mediaListEntry && settings.value.dubNotify?.includes('NOTONLIST')) || (cachedMedia?.mediaListEntry && settings.value.dubNotify?.includes(cachedMedia?.mediaListEntry?.status))
                if (notify && media.format !== 'MUSIC') {
                    const details = {
                        title: anilistClient.title(media),
                        message: 'A dub has just been announced for ' + new Date(media?.airingSchedule?.nodes?.[0]?.episodeDate).toLocaleString('en-US',{ weekday: 'long', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }) + '!',
                        icon: media?.coverImage?.medium,
                        heroImg: media?.bannerImage
                    }
                    if (settings.value.systemNotify) {
                        IPC.emit('notification', {
                            ...details,
                            button: [{text: 'View Anime', activation: `shiru://anime/${media?.id}`}],
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
                            timestamp: Math.floor(new Date().getTime() / 1000) - 5,
                            dub: true,
                            click_action: 'VIEW'
                        }
                    }))
                }
                updateNotify('announcedDubs', (current) => [...current, media?.id])
            }
        }
    }

    async getFeed(feed) {
        let res = {}
        try {
            res = await fetch(`https://raw.githubusercontent.com/RockinChaos/dub-schedule/master/${feed}.json?timestamp=${new Date().getTime()}`, {
                method: 'GET'
            })
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
        return json
    }

    async feedChanged() {
        const content = this.getFeed('dub-episode-feed')
        const res = await this.airedLists.value
        if (JSON.stringify(await content) !== JSON.stringify(res)) {
            this.airedLists.value = content
            return true
        }
        return false
    }

    getMediaForRSS(page, perPage) {
        const res = this._getMediaForRSS(page, perPage)
        res.catch(e => {
            if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
                toast.error('Search Failed', {
                    description: 'Failed to load media for home feed!\n' + e.message
                })
            }
            debug('Failed to load media for home feed', e.stack)
        })
        return Array.from({ length: perPage }, (_, i) => ({ type: 'episode', data: this.fromPending(res, i) }))
    }

    async _getMediaForRSS(page, perPage) {
        debug(`Getting media for schedule feed (Dubbed) page ${page} perPage ${perPage}`)
        if (!this.airedLists.value) await this.feedChanged()
        const res = await this.airedLists.value
        const cachedAiredLists = this.airedListsCache.value[`${page}-${perPage}`]
        const paginatedLists = res.slice((page - 1) * perPage, page * perPage) || []
        const ids = paginatedLists.map(({ id }) => id)

        hasNextPage.value = ids?.length === perPage
        if (!ids.length) return {}

        if (cachedAiredLists && JSON.stringify(cachedAiredLists.airedLists) === JSON.stringify(res)) return cachedAiredLists.results
        debug(`Episode Feed (Dubbed) has changed, updating`)

        const medias = await anilistClient.searchIDS({ id: Array.from(new Set(ids)) })
        if (!medias?.data && medias?.errors) throw medias.errors[0]
        const items = {
            ...medias,
            data: {
                ...medias.data,
                Page: {
                    ...medias.data.Page,
                    media: paginatedLists.map(({id, episode}) => {
                        return {
                            ...Object.fromEntries(medias?.data?.Page?.media.map(media => [media.id, media]))[id],
                            episode: episode
                        }
                    })
                }
            }
        }

        const results = this.structureResolveResults(items)
        const lastNotified = notify.value['lastDub']
        const newReleases = items?.data?.Page?.media?.filter(media => Math.floor(new Date(media.episode.airedAt).getTime() / 1000) >= lastNotified)

        if (newReleases && !settings.value.dubNotifyLimited && settings.value.dubNotify?.length > 0 && lastNotified > 0) {
            for (const media of newReleases) {
                const airedAt = Math.floor(new Date(media.episode.airedAt).getTime() / 1000)
                const notify = (!media?.mediaListEntry && settings.value.dubNotify?.includes('NOTONLIST')) || (media?.mediaListEntry && settings.value.dubNotify?.includes(media?.mediaListEntry?.status))
                if (notify && (!settings.value.dubNotifyLimited || unaired) && media.format !== 'MUSIC') {
                    const details = {
                        title: anilistClient.title(media),
                        message: `Episode ${media?.episode?.aired} (Dub) is out in the United States, it should be available soon.`,
                        icon: media?.coverImage?.medium,
                        heroImg: media?.bannerImage
                    }
                    if (settings.value.systemNotify) {
                        IPC.emit('notification', {
                            ...details,
                            button: [{text: 'View Anime', activation: `shiru://anime/${media?.id}`}],
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
                            episode: media?.episode?.aired,
                            timestamp: airedAt,
                            dub: true,
                            click_action: 'PLAY'
                        }
                    }))
                }
            }
        }
        debug(`Found ${newReleases?.length} new dubbed releases, notifying...`)
        updateNotify('lastDub', Math.floor(Date.now() / 1000))

        this.airedListsCache.value[`${page}-${perPage}`] = {
            airedLists: res,
            results
        }

        return results
    }

    async structureResolveResults (items) {
        const results = items?.data?.Page?.media?.map((media) => ({ media, episode: media.episode.aired, date: new Date(media.episode.airedAt) }))
        return results.map(async (result, i) => {
            const res = {
                ...result,
                episodeData: undefined,
                onclick: undefined
            }
            if (res.media?.id) {
                try {
                    res.episodeData = (await getEpisodeMetadataForMedia(res.media))?.[res.episode]
                } catch (e) {
                    debug(`Warn: failed fetching episode metadata for ${res.media.title?.userPreferred} episode ${res.episode}: ${e.stack}`)
                }
            }
            res.parseObject = {
                language: 'English'
            }
            res.onclick = () => {
                window.dispatchEvent(new CustomEvent('play-anime', {
                    detail: {
                        id: res.media?.id,
                        episode: res.episode,
                        torrentOnly: true
                    }
                }))
                return true
            }
            return res
        })
    }

    async fromPending (result, i) {
        const array = await result
        return array[i]
    }

    printError(error) {
        debug(`Error: ${error.status || 429} - ${error.message || codes[error.status || 429]}`)
        if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
            toast.error('Search Failed', {
                description: `Failed to fetch the dubbed anime schedule!\n${error.status || 429} - ${error.message || codes[error.status || 429]}`,
                duration: 3000
            })
        }
    }
}

export const animeSchedule = new AnimeSchedule()
