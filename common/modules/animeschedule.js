import { toast } from 'svelte-sonner'
import { writable } from 'simple-store-svelte'
import { anilistClient, codes } from '@/modules/anilist.js'
import { malDubs } from '@/modules/animedubs.js'
import { settings } from '@/modules/settings.js'
import { cache, caches } from '@/modules/cache.js'
import { getEpisodeMetadataForMedia } from '@/modules/anime.js'
import { hasNextPage } from '@/modules/sections.js'
import Helper from '@/modules/helper.js'
import IPC from '@/modules/ipc.js'
import Debug from 'debug'

const debug = Debug('ui:animeschedule')

/*
 * AnimeSchedule.net (Dub Schedule) and AniChart (Sub/Hentai Schedule)
 * Handles periodic fetching of the dub airing schedule which is based on timetables from animeschedule.net tokenized api access and the sub/hentai schedule from AniChart.
 */
class AnimeSchedule {
    subAiring = writable([])
    dubAiring = writable([])
    subAiringLists = writable()
    dubAiringLists = writable()
    subAiredLists = writable()
    dubAiredLists = writable()
    hentaiAiredLists = writable()
    subAiredListsCache = writable({})
    dubAiredListsCache = writable({})
    hentaiAiredListsCache = writable({})

    constructor() {
        this.subAiringLists.value = this.getFeed('sub-schedule')
        this.dubAiringLists.value = this.getFeed('dub-schedule')
        this.findNewNotifications()
        this.findNewDelayedEpisodes()

        //  update airingLists every 30 mins
        setInterval(async () => {
            debug(`Updating dub airing schedule`)
            try {
                const updatedFeed = await this.getFeed('sub-schedule')
                this.subAiringLists.value = Promise.resolve(updatedFeed)
            } catch (error) {
                debug(`Failed to update Sub schedule at the scheduled interval, this is likely a temporary connection issue: ${JSON.stringify(error)}`)
            }
            try {
                const updatedFeed = await this.getFeed('dub-schedule')
                this.dubAiringLists.value = Promise.resolve(updatedFeed)
            } catch (error) {
                debug(`Failed to update Dub schedule at the scheduled interval, this is likely a temporary connection issue: ${JSON.stringify(error)}`)
            }
            this.findNewNotifications()
            this.findNewDelayedEpisodes()
        }, 1000 * 60 * 30)

        // check notifications every 5 mins
        setInterval(() => this.findNewNotifications(), 1000 * 60 * 5)

        this.dubAiringLists.subscribe(async value  => {
            this.dubAiring.value = await value
        })
        this.subAiringLists.subscribe(async value  => {
            this.subAiring.value = await value
        })
    }

    async findNewDelayedEpisodes() { // currently only dubs are handled as they typically get delayed...
        debug(`Checking for delayed dub episodes...`)
        const delayedEpisodes = (await this.dubAiringLists.value).filter(entry => new Date(entry.delayedFrom) <= new Date() && new Date(entry.delayedUntil) > new Date()).filter(entry => !cache.getEntry(caches.NOTIFICATIONS, 'delayedDubs').includes(`${entry?.media?.media?.id}:${entry.episodeNumber}:${entry.delayedUntil}`))
        debug(`Found ${delayedEpisodes.length} delayed episodes${delayedEpisodes.length > 0 ? '.. notifying!' : ''}`)
        if (delayedEpisodes.length === 0) return
        await anilistClient.searchAllIDS({id: delayedEpisodes.map(entry => entry?.media?.media.id)})
        for (const entry of delayedEpisodes) {
            const media = entry?.media?.media
            const cachedMedia = cache.mediaCache.value[media?.id]
            const notify = (!cachedMedia?.mediaListEntry && settings.value.releasesNotify?.includes('NOTONLIST')) || (cachedMedia?.mediaListEntry && settings.value.releasesNotify?.includes(cachedMedia?.mediaListEntry?.status))
            if (notify && media.format !== 'MUSIC') {
                const details = {
                    title: anilistClient.title(media),
                    message: `Episode ${entry.episodeNumber} has been delayed until ` + (entry?.delayedIndefinitely && !entry.status?.toUpperCase()?.includes('FINISHED') ? 'further notice, production has been suspended' : entry.delayedIndefinitely ? 'further notice, this is determined to be a partial dub so this episode will likely not be dubbed' : (new Date(entry?.delayedUntil).toLocaleString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    }))) + '!',
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
                        episode: entry?.episodeNumber,
                        timestamp: Math.floor(new Date().getTime() / 1000) - 5,
                        format: media?.format,
                        delayed: true,
                        dub: true,
                        click_action: 'VIEW'
                    }
                }))
            }
            cache.setEntry(caches.NOTIFICATIONS, 'delayedDubs', (current) => [...current, `${media?.id}:${entry.episodeNumber}:${entry.delayedUntil}`])
        }
    }

    async findNewNotifications() {
        for (const type of ['Dub', 'Sub', 'Hentai']) {
            if (type === 'Hentai' && settings.value.adult !== 'hentai') return
            const key = `${type.toLowerCase()}Announce`
            const notifyKey = `announced${type}s`
            const airingListKey = `${type === 'Hentai' ? 'sub' : type.toLowerCase()}AiringLists`

            debug(`Checking for new ${type} Schedule notifications`)
            const newNotifications = (await this[airingListKey].value).filter(entry => (entry?.unaired && ((type !== 'Hentai' && !(entry?.media?.media?.genres || entry?.genres)?.includes('Hentai')) || (type === 'Hentai' && (entry?.media?.media?.genres || entry?.genres)?.includes('Hentai'))) && !cache.getEntry(caches.NOTIFICATIONS, notifyKey).includes(entry?.media?.media?.id || entry?.id))).map(entry => entry?.media?.media || entry)
            debug(`Found ${newNotifications?.length} new ${type} notifications`)
            if (newNotifications?.length === 0) return
            await anilistClient.searchAllIDS({id: newNotifications.map(media => media.id)})
            for (const media of newNotifications) {
                const cachedMedia = cache.mediaCache.value[media?.id]
                if (settings.value[key] !== 'none' && media?.id) {
                    const res = await Helper.getClient().userLists.value
                    const isFollowing = () => {
                        if (!res?.data && res?.errors) throw res.errors[0]
                        if (!Helper.isAuthorized()) return false
                        const mediaList = Helper.isAniAuth()
                            ? res.data.MediaListCollection.lists.find(({ status }) => status === 'CURRENT' || status === 'REPEATING' || status === 'COMPLETED' || status === 'PAUSED' || status === 'PLANNING')?.entries
                            : res.data.MediaList.filter(({ node }) => node.my_list_status.status === Helper.statusMap('CURRENT') || node.my_list_status.is_rewatching || node.my_list_status.status === Helper.statusMap('COMPLETED') || node.my_list_status.status === Helper.statusMap('PAUSED') || node.my_list_status.status === Helper.statusMap('PLANNING'))
                        if (!mediaList) return false
                        return (cachedMedia?.relations?.edges?.map(edge => edge.node.id) || []).some(id => (Helper.isAniAuth() ? mediaList.map(({ media }) => media.id) : mediaList.map(({ node }) => node.id)).includes(id))
                    }
                    const notify = settings.value[key] === 'all' || isFollowing()
                    if (notify && media.format !== 'MUSIC') {
                        const details = {
                            title: anilistClient.title(media),
                            message: `${type === 'Dub' ? 'A dub has just been' : 'Was recently'} announced for ` + (new Date(type === 'Dub' ? media?.airingSchedule?.nodes?.[0]?.airingAt : media?.airingSchedule?.nodes?.[0]?.airingAt * 1000).toLocaleString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                            })) + '!',
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
                                format: media?.format,
                                dub: type === 'Dub',
                                click_action: 'VIEW'
                            }
                        }))
                    }
                }
                updateNotify(notifyKey, (current) => [...current, media?.id])
            }
        }
    }

    async getFeed(feed) {
        let res = {}
        try {
            res = await fetch(`https://raw.githubusercontent.com/RockinChaos/AniSchedule/master/raw/${feed}.json?timestamp=${new Date().getTime()}`, {
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

    async feedChanged(type) {
        const content = this.getFeed(`${type.toLowerCase()}-episode-feed`)
        const res = await this[`${type.toLowerCase()}AiredLists`].value
        if (JSON.stringify(await content) !== JSON.stringify(res)) {
            this[`${type.toLowerCase()}AiredLists`].value = content
            return true
        }
        return false
    }

    getMediaForRSS(page, perPage, type) {
        const res = this._getMediaForRSS(page, perPage, type)
        res.catch(e => {
            if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
                toast.error('Search Failed', {
                    description: `Failed to load media for home feed for ${type}!` + e.message
                })
            }
            debug(`Failed to load media for home feed for ${type}`, e.stack)
        })
        return Array.from({ length: perPage }, (_, i) => ({ type: 'episode', data: this.fromPending(res, i) }))
    }

    async _getMediaForRSS(page, perPage, type) {
        debug(`Getting media for schedule feed (${type}) page ${page} perPage ${perPage}`)
        if (!this[`${type.toLowerCase()}AiredLists`].value) await this.feedChanged(type)
        let res = await this[`${type.toLowerCase()}AiredLists`].value
        const section = settings.value.homeSections.find(s => s[0].includes(type))
        if (section && section[2].length > 0) res = res.filter(episode => section[2].includes(episode.format))
        const cachedAiredLists = this[`${type.toLowerCase()}AiredListsCache`].value[`${page}-${perPage}`]
        const paginatedLists = res.slice((page - 1) * perPage, page * perPage) || []
        const ids = paginatedLists.map(({ id }) => id)

        hasNextPage.value = ids?.length === perPage
        if (!ids.length) return {}

        if (cachedAiredLists && JSON.stringify(cachedAiredLists.airedLists) === JSON.stringify(res)) return cachedAiredLists.results
        debug(`Episode Feed (${type}) has changed, updating`)

        const missedIDS = res.filter(media => cache.getEntry(caches.NOTIFICATIONS, `last${type}`) > 0 && ((Math.floor(new Date(media.episode.airedAt).getTime() / 1000) >= cache.getEntry(caches.NOTIFICATIONS, `last${type}`)) || (Math.floor(new Date(media.episode.addedAt).getTime() / 1000) >= cache.getEntry(caches.NOTIFICATIONS, `last${type}`)))).filter(media => !ids.includes(media.id)).sort((a, b) => new Date(b.episode.addedAt) - new Date(a.episode.addedAt)).slice(0, 300).map(media => media.id)
        const medias = await anilistClient.searchAllIDS({ id: Array.from(new Set([...ids, ...missedIDS])) })
        if (!medias?.data && medias?.errors) throw medias.errors[0]

        const items = {
            ...medias,
            data: {
                ...medias.data,
                Page: {
                    ...medias.data.Page,
                    media: paginatedLists.map(({ id, episode }) => {
                        return {
                            ...Object.fromEntries(medias?.data?.Page?.media.map(media => [media.id, media]))[id],
                            episode: episode
                        }
                    })
                }
            }
        }
        const combinedItems = {
            ...medias,
            data: {
                ...medias.data,
                Page: {
                    ...medias.data.Page,
                    media: [
                        ...items.data.Page.media,
                        ...res.filter(({id}) => missedIDS.includes(id)).filter(({ id, episode }) => !paginatedLists.some(item => item.id === id && item.episode === episode)).map(({id, episode}) => {
                        return {
                            ...Object.fromEntries(medias?.data?.Page?.media.map(media => [media.id, media]))[id],
                            episode: episode
                        }
                    })]
                }
            }
        }

        const results = this.structureResolveResults(items, type)
        if (type === 'Dub' || type === 'Sub' || type === 'Hentai') {
            if (type === 'Hentai' && settings.value.adult !== 'hentai') return
            const lastNotified = cache.getEntry(caches.NOTIFICATIONS, `last${type}`)
            const newReleases = combinedItems?.data?.Page?.media?.filter(media => (Math.floor(new Date(media.episode.airedAt).getTime() / 1000) >= lastNotified) || (Math.floor(new Date(media.episode.addedAt).getTime() / 1000) >= lastNotified))
            if (newReleases && settings.value.releasesNotify?.length > 0 && lastNotified > 0) {
                for (const media of newReleases) {
                    const addedAt = Math.floor(new Date(media.episode.addedAt).getTime() / 1000)
                    const notify = (!media?.mediaListEntry && settings.value.releasesNotify?.includes('NOTONLIST')) || (media?.mediaListEntry && settings.value.releasesNotify?.includes(media?.mediaListEntry?.status))
                    if (notify && (type === 'Dub' || !settings.value.rssNotifyDubs || !malDubs.isDubMedia(media)) && media.format !== 'MUSIC') {
                        const details = {
                            title: anilistClient.title(media),
                            message: `${media.format !== 'MOVIE' ? ` ${media?.episodes === media?.episode?.aired ? `The wait is over! ` : ''}Episode ${media?.episode?.aired}` : `The Movie`} (${type}) is out in ${type === 'Dub' ? 'the United States' : 'Japan'}, ${media.format !== 'MOVIE' && media?.episodes === media?.episode?.aired ? `this season should be available to binge soon!` : `it should be available soon.`}`,
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
                            window.dispatchEvent(new CustomEvent('notification-app', {
                                detail: {
                                    ...details,
                                    id: media?.id,
                                    episode: media?.episode?.aired,
                                    timestamp: addedAt,
                                    format: media?.format,
                                    dub: type === 'Dub',
                                    click_action: 'PLAY'
                                }
                            }))
                        }
                    }
                }
            }
            debug(`Found ${newReleases?.length} new ${type} releases, notifying...`)
            updateNotify(`last${type}`, Math.floor(Date.now() / 1000))
        }

        this[`${type.toLowerCase()}AiredListsCache`].value[`${page}-${perPage}`] = {
            airedLists: res,
            results
        }

        return results
    }

    async structureResolveResults (items, type) {
        const results = items?.data?.Page?.media?.map((media) => ({ media, episode: media.episode.aired, date: new Date(media.episode.airedAt) }))
        return results.map(async (result) => {
            const res = {
                ...result,
                parseObject: {
                    language: (type === 'Dub' ? 'English' : 'Japanese')
                },
                episodeData: undefined,
                onclick: undefined
            }
            if (res.media?.id) {
                try {
                    res.episodeData = (await getEpisodeMetadataForMedia(res.media))?.[res.episode]
                } catch (e) {
                    debug(`Warn: failed fetching episode metadata for ${res.media.title?.userPreferred} episode ${res.episode}: ${e.stack} on feed (${type})`)
                }
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
            if (res.media?.format === 'MOVIE') {
                delete res.episode
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
                description: `Failed to fetch the anime schedule(s)!\n${error.status || 429} - ${error.message || codes[error.status || 429]}`,
                duration: 3000
            })
        }
    }
}

export const animeSchedule = new AnimeSchedule()
