import { toast } from 'svelte-sonner'
import { matchPhrase } from "@/modules/util.js"
import { writable } from 'simple-store-svelte'
import { codes } from '@/modules/anilist.js'
import Debug from 'debug'

const debug = Debug('ui:animedubs')

/*
 * MAL (MyAnimeList) Dubs (Mal-Dubs)
 * Dub information is returned as MyAnimeList ids.
 */
class MALDubs {
    /** @type {import('simple-store-svelte').Writable<ReturnType<MALDubs['getDubs']>>} */
     dubLists = writable()

    constructor() {
        this.getMALDubs()
        //  update dubLists every 60 mins
        setInterval(() => {
            this.getMALDubs()
        }, 1000 * 60 * 60)
    }

    isDubMedia(media) {
        if (this.dubLists.value?.dubbed) {
            if (media?.idMal) {
                return this.dubLists.value.dubbed.includes(media.idMal) || this.dubLists.value.incomplete.includes(media.idMal)
            } else if (media?.language || media?.file_name) {
                return matchPhrase(media?.language, 'English', 3) || matchPhrase(media?.file_name, ['Multi Audio', 'Dual Audio', 'English Audio', 'English Dub'], 3) || matchPhrase(media?.file_name, ['Dual', 'Dub'], 1)
            }
        }
    }

    async getMALDubs() {
        debug('Getting MyAnimeList Dubs IDs')
        let res = {}
        try {
            res = await fetch('https://raw.githubusercontent.com/MAL-Dubs/MAL-Dubs/main/data/dubInfo.json')
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
        this.dubLists.value = await json
        return json
    }

    printError(error) {
        debug(`Error: ${error.status || 429} - ${error.message || codes[error.status || 429]}`)
        toast.error('Dub Caching Failed', {
            description: `Failed to load dub information!\n${error.status || 429} - ${error.message || codes[error.status || 429]}`,
            duration: 3000
        })
    }
}

export const malDubs = new MALDubs()