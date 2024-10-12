import AnimeResolver from '@/modules/animeresolver.js'
import { toast } from 'svelte-sonner'
import { writable } from 'simple-store-svelte'
import { codes } from '@/modules/anilist.js'
import { past } from "@/modules/util"
import Debug from 'debug'

const debug = Debug('ui:animeschedule')

/*
 * AnimeSchedule.net (Dub Schedule)
 * Handles periodic fetching of the dub airing schedule which is based on timetables from animeschedule.net tokenized api access.
 */
class AnimeSchedule {
    airingLists = writable()

    constructor() {
        this.getAiring()
        //  update airingLists every 30 mins
        setInterval(() => {
            debug(`Updating dub airing schedule`)
            this.getAiring()
        }, 1000 * 60 * 30)
    }

    async resolveAiringLists(airing) {
        if (!airing) return {}
        const titles = []
        const order = []

        // Resolve routes as titles
        const parseObjs = await AnimeResolver.findAndCacheTitle(airing.map(item => item.route))

        for (const parseObj of parseObjs) {
            const media = AnimeResolver.animeNameCache[AnimeResolver.getCacheKeyForTitle(parseObj)]
            debug(`Resolving route ${parseObj?.anime_title} ${media?.title?.userPreferred}`)
            let item

            if (!media) { // Resolve failed routes
                debug(`Failed to resolve, trying alternative title ${parseObj?.anime_title}`)
                item = airing.find(i => i.route === parseObj.anime_title)
                const fallbackTitles = await AnimeResolver.findAndCacheTitle([item.romaji, item.native, item.english, item.title].filter(Boolean))
                for (const parseObjAlt of fallbackTitles) {
                    const mediaAlt = AnimeResolver.animeNameCache[AnimeResolver.getCacheKeyForTitle(parseObjAlt)]
                    if (mediaAlt) {
                        titles.push(parseObjAlt.anime_title)
                        order.push({ route: item.route, title: mediaAlt.title.userPreferred })
                        debug(`Resolved alternative title ${parseObjAlt?.anime_title} ${mediaAlt?.title?.userPreferred}`)
                        break
                    }
                }
            } else {
                item = airing.find(i => i.route === parseObj.anime_title)
                if (item) {
                    titles.push(parseObj.anime_title)
                    order.push({ route: item.route, title: media.title.userPreferred })
                    debug(`Resolved route ${parseObj?.anime_title} ${media?.title?.userPreferred}`)
                }
            }
        }

        // Resolve found titles
        const results = await AnimeResolver.resolveFileAnime(titles)
        for (const entry of order) { // remap dub airingSchedule to results airingSchedule
            const mediaMatch = results.find(result => result.media?.title?.userPreferred === entry.title)
            if (mediaMatch) {
                const airingItem = airing.find(i => i.route === entry.route)
                if (airingItem) {
                    debug(`Mapping dubbed airing schedule for ${airingItem.route} ${mediaMatch.media?.title?.userPreferred}`)
                    mediaMatch.media.airingSchedule = {
                        nodes: [
                            {
                                episode: airingItem.episodeNumber + ((new Date(airingItem.episodeDate) < new Date()) ? 1 : 0),
                                airingAt: Math.floor(past(new Date(airingItem.episodeDate), 1).getTime() / 1000),
                                episodeNumber: airingItem.episodeNumber,
                                episodeDate: airingItem.episodeDate,
                                delayedUntil: airingItem.delayedUntil
                            },
                        ],
                    }
                }
            }
        }
        return results
    }

    async getAiring() {
        debug('Getting dub airing schedule')
        let res = {}
        try {
            res = await fetch('https://raw.githubusercontent.com/RockinChaos/dub-schedule/master/dub-schedule.json', {
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
        this.airingLists.value = this.resolveAiringLists(await json)
        return json
    }

    printError(error) {
        debug(`Error: ${error.status || 429} - ${error.message || codes[error.status || 429]}`)
        toast.error('Search Failed', {
            description: `Failed to fetch the dubbed anime schedule!\n${error.status || 429} - ${error.message || codes[error.status || 429]}`,
            duration: 3000
        })
    }
}

export const animeSchedule = new AnimeSchedule()