import { debounce, generalDefaults, historyDefaults, queryDefaults, notifyDefaults } from './util.js'
import { writable } from 'simple-store-svelte'
import Debug from 'debug'

const debug = Debug('ui:cache')

/**
 * A collection of cache configurations used in the application.
 * Each entry represents a cache with its unique key and optional database configuration.
 *
 * @constant
 * @type {Object<string, {key: string, database?: boolean}>}
 */
export const caches = Object.freeze({
    GENERAL: { key: 'general', database: true},
    QUERIES: { key: 'queries', database: true },
    MAPPINGS: { key: 'mappings', database: true },
    USER_LISTS: { key: 'user_lists', database: true },
    MEDIA_CACHE: { key: 'medias', database: true },
    HISTORY: { key: 'history', database: true},
    NOTIFICATIONS: { key: 'notifications', database: true},
    COMPOUND: { key: 'compound'},
    EPISODES: { key: 'episodes'},
    FOLLOWING: { key: 'following'},
    RECOMMENDATIONS: { key: 'recommendations' },
    SEARCH_IDS: { key: 'searchIDS'},
    SEARCH: { key: 'search'}
})

/**
 * Maps the given status between AniList and MyAnimeList formats.
 *
 * This function converts a media status from MyAnimeList format (e.g., 'watching', 'completed') to its equivalent in the AniList format (e.g., 'CURRENT', 'COMPLETED'),
 * and vice versa. It helps ensure compatibility between the two systems when syncing media list data.
 * The status mapping is bidirectional, allowing both MyAnimeList to AniList and AniList to MyAnimeList conversions.
 *
 * @param {string} status - The status to be mapped. Can be in either AniList or MyAnimeList format.
 * @returns {string} The mapped status in the corresponding format.
 *
 * @example
 * mapStatus('watching') // returns 'CURRENT'
 * mapStatus('CURRENT') // returns 'watching'
 */
export function mapStatus(status) {
    switch(status) {
        // MyAnimeList to AniList
        case 'watching':
            return 'CURRENT'
        case 'rewatching':
            return 'REPEATING' // rewatching is determined by is_rewatching boolean (no individual list)
        case 'plan_to_watch':
            return 'PLANNING'
        case 'completed':
            return 'COMPLETED'
        case 'dropped':
            return 'DROPPED'
        case 'on_hold':
            return 'PAUSED'
        // AniList to MyAnimeList
        case 'CURRENT':
            return 'watching'
        case 'PLANNING':
            return 'plan_to_watch'
        case 'COMPLETED':
            return 'completed'
        case 'DROPPED':
            return 'dropped'
        case 'PAUSED':
            return 'on_hold'
        case 'REPEATING':
            return 'watching' // repeating is determined by is_rewatching boolean (no individual list)
    }
}

/**
 * Fills the queried AniList media entry with additional user list data from alternate authorizations (e.g., MyAnimeList).
 *
 * This function attaches user-specific data to the AniList media entry, such as progress, status, start/completion dates,
 * and custom list information, by matching the media's ID with entries from the provided user lists.
 *
 * @param {Object} media - The AniList media object to be filled with user list data.
 * @param {Object} userLists - The user list data, containing entries from alternate authorizations like MyAnimeList.
 * @param {Object} userLists.data - The user list data structure containing a list of media entries.
 * @param {Array<Object>} userLists.data.MediaList - An array of media list entries from alternate authorizations.
 */
function fillEntry(media, userLists) {
    debug(`Filling MyAnimeList entry data for ${media?.id} -> AniList`)
    const malEntry = userLists.data?.MediaList?.find(({ node }) => node.id === media.idMal)
    if (malEntry) {
        const start_date = malEntry.node.my_list_status.start_date ? new Date(malEntry.node.my_list_status.start_date) : undefined
        const finish_date = malEntry.node.my_list_status.finish_date ? new Date(malEntry.node.my_list_status.finish_date) : undefined
        const startedAt = start_date ? {
            year: start_date.getFullYear(),
            month: start_date.getMonth() + 1,
            day: start_date.getDate()
        } : undefined
        const completedAt = finish_date ? {
            year: finish_date.getFullYear(),
            month: finish_date.getMonth() + 1,
            day: finish_date.getDate()
        } : undefined
        media.mediaListEntry = {
            id: media.id,
            progress: malEntry.node.my_list_status.num_episodes_watched,
            repeat: malEntry.node.my_list_status.number_times_rewatched,
            status: mapStatus(malEntry.node.my_list_status?.is_rewatching ? 'rewatching' : malEntry.node.my_list_status?.status),
            customLists: [],
            score: malEntry.node.my_list_status.score,
            startedAt,
            completedAt
        }
    }
}

/**
 * Opens the IndexedDB database.
 * @param {string} dbName - The name of the database to open.
 * @returns {Promise<IDBDatabase>} - A promise that resolves to the database instance.
 */
function open(dbName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(String(dbName), 1)
        request.onerror = (event) => reject(event.target.error)
        request.onsuccess = (event) => resolve(event.target.result)
        request.onupgradeneeded = (event) => {
            Object.entries(caches).forEach(([_, cache]) => {
                if (cache.database && !(event.target.result).objectStoreNames.contains(cache.key)) (event.target.result).createObjectStore(cache.key, { keyPath: 'key' })
            })
        }
    })
}

/**
 * Loads all values from a specified cache (object store).
 * @param {string} userID - The unique ID of the user (database name).
 * @param {keyof typeof caches} cache - The name of the cache (object store).
 * @returns {Promise<Array>} - A promise that resolves to an array of all stored values.
 */
async function loadAll(userID, cache) {
    const database = await open(userID)
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(cache.key, 'readonly')
        const objectStore = transaction.objectStore(cache.key)
        const request = objectStore.getAll()
        request.onerror = (event) => reject(event.target.error)
        request.onsuccess = (event) => {
            resolve(event.target.result.reduce((acc, item) => {
                acc[item.key] = item.value
                return acc
            }, {}))
        }
    })
}

/**
 * Retrieves a specific value from a cache using a key.
 * @param {string} userID - The unique ID of the user (database name).
 * @param {keyof typeof caches} cache - The name of the cache (object store).
 * @param {string} key - The key to retrieve the associated value for.
 * @returns {Promise<*>} - A promise that resolves to the value associated with the key, or null if not found.
 */
async function get(userID, cache, key) {
    const database = await open(userID)
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(cache.key, 'readonly')
        const objectStore = transaction.objectStore(cache.key)
        const request = objectStore.get(key)
        request.onerror = (event) => reject(event.target.error)
        request.onsuccess = (event) => resolve(event.target.result ? event.target.result.value : null)
    })
}

/**
 * Stores or updates a value in a specified cache.
 * @param {string} userID - The unique ID of the user (database name).
 * @param {keyof typeof caches} cache - The name of the cache (object store).
 * @param {string} key - The key to associate with the value.
 * @param {*} value - The value to store.
 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
 */
async function set(userID, cache, key, value) {
    const database = await open(userID)
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(cache.key, 'readwrite')
        const objectStore = transaction.objectStore(cache.key)
        const request = objectStore.put({ key, value })
        request.onerror = (event) => reject(event.target.error)
        request.onsuccess = () => resolve()
    })
}

/**
 * Deletes specific keys from a specified cache.
 * @param {string} userID - The unique ID of the user (database name).
 * @param {keyof typeof caches} cache - The name of the cache (object store).
 * @param {string[]} keys - An array of keys to delete.
 * @returns {Promise<void>} - A promise that resolves when all specified keys are deleted.
 */
async function remove(userID, cache, keys) {
    const database = await open(userID)
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(cache.key, 'readwrite')
        const objectStore = transaction.objectStore(cache.key)
        Promise.all(
            keys.map((key) =>
                new Promise((res, rej) => {
                    const request = objectStore.delete(key)
                    request.onerror = (event) => rej(event.target.error)
                    request.onsuccess = () => res()
                })
            )
        ).then(() => resolve()).catch((error) => reject(error))
    })
}

/**
 * Clears all data from a specified cache.
 * @param {string} userID - The unique ID of the user (database name).
 * @param {keyof typeof caches} cache - The name of the cache (object store).
 * @returns {Promise<void>} - A promise that resolves when the cache is cleared.
 */
async function reset(userID, cache) {
    const database = await open(userID)
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(cache.key, 'readwrite')
        const objectStore = transaction.objectStore(cache.key)
        const request = objectStore.clear()
        request.onerror = (event) => reject(event.target.error)
        request.onsuccess = () => resolve()
    })
}

/**
 * Deletes the entire database and all caches for a user.
 * @param {string} userID - The unique ID of the user (database name).
 * @returns {Promise<void>} - A promise that resolves when the database is deleted.
 */
async function purge(userID) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(String(userID))
        request.onerror = (event) => reject(event.target.error)
        request.onsuccess = () => resolve()
    })
}

/**
 * Generates a set of debounced functions for cache updating.
 * Each debounced function compares the new values with the previous ones
 * and saves them if there are any differences. The number of debounced
 * functions is based on the length of the provided `caches`.
 *
 * @param {string} userID - The unique ID of the user (database name).
 * @param {number} [delay=4500] - The debounce delay in milliseconds. Default is 4500ms.
 * @returns {Object} An object containing debounced functions for each cache, accessible via the number of caches created like `[1]`, `[2]`, etc.
 */
function createDebouncers(userID, delay = 2000) {
    const debouncers = {}
    for (let i = 1; i <= Object.values(caches).filter(cache => cache.database).length; i++) {
        debouncers[`${i}`] = debounce(async (cache, value) => {
            if (Object.keys(value).length !== 0) {
                const changed = []
                debug(`Detected a potential change for the ${cache.key} cache, attempting to save...`)
                for (const [key, keyValue] of Object.entries(value)) {
                    const prevValue = await get(userID, cache, key)
                    if (JSON.stringify(keyValue) !== JSON.stringify(prevValue)) {
                        changed.push(key)
                        set(userID, cache, key, keyValue)
                    }
                }
                if (changed?.length > 0) debug(`Found differences in ${cache.key} for ${JSON.stringify(changed)} and saved!`)
            }
        }, delay)
    }
    return debouncers
}

class Cache {
    /** @type {string} */
    cacheID = (JSON.parse(localStorage.getItem('ALviewer')) || JSON.parse(localStorage.getItem('MALviewer')))?.viewer?.data?.Viewer?.id || 'default'
    /** @type {import('simple-store-svelte').Writable<Record<number, import('./al.d.ts').Media>>} */
    mediaCache
    /** @type {import('svelte/store').Writable<GeneralDefaults>} */
    #general
    /** @type {import('svelte/store').Writable<QueryDefaults>} */
    #queries
    /** @type {import('simple-store-svelte').Writable<any>} */
    #userLists
    /** @type {import('simple-store-svelte').Writable<any>} */
    #mappings
    /** @type {import('svelte/store').Writable<NotifyDefaults>} */
    #notify
    /** @type {import('svelte/store').Writable<any>} */
    #history
    /** @type {Map<string, any>} */
    #pending = new Map()

    /**
     * @type {Promise<void>}
     * A promise that resolves when the cache has been fully initialized.
     * Use this to ensure all required data is loaded and ready for use.
     */
    isReady
    isCurrent = false
    constructor(subscribe) {
        this.isReady = this.#initialize(subscribe)
    }

    subscribers = []
    /**
     * Initializes the cache by loading necessary data into memory.
     * @returns {Promise<void>}
     */
    async #initialize(subscribe = true) {
        debug(`Loading caches with id: ${this.cacheID}...`)
        this.mediaCache = writable({ ...(await loadAll(this.cacheID, caches.MEDIA_CACHE)) })
        this.#general = writable({ ...generalDefaults, ...(await loadAll(this.cacheID, caches.GENERAL)) })
        this.#queries = writable({ ...queryDefaults, ...(await loadAll(this.cacheID, caches.QUERIES)) })
        this.#mappings = writable({ ...(await loadAll(this.cacheID, caches.MAPPINGS)) })
        this.#userLists = writable({ ...(await loadAll(this.cacheID, caches.USER_LISTS)) })
        this.#notify = writable({ ...notifyDefaults, ...(await loadAll(this.cacheID, caches.NOTIFICATIONS)) })
        this.#history = writable({ ...historyDefaults, ...(await loadAll(this.cacheID, caches.HISTORY)) })
        if (subscribe) {
            const debouncers = createDebouncers(this.cacheID)
            this.subscribers.push(
                this.mediaCache.subscribe(value => debouncers[1](caches.MEDIA_CACHE, value)),
                this.#general.subscribe(value => debouncers[2](caches.GENERAL, value)),
                this.#queries.subscribe(value => debouncers[3](caches.QUERIES, value)),
                this.#mappings.subscribe(value => debouncers[4](caches.MAPPINGS, value)),
                this.#userLists.subscribe(value => debouncers[5](caches.USER_LISTS, value)),
                this.#notify.subscribe(value => debouncers[6](caches.NOTIFICATIONS, value)),
                this.#history.subscribe(value => debouncers[7](caches.HISTORY, value))
            )
        }
        this.isCurrent = true
        debug('Caches have successfully been loaded!')
    }

    destroy() {
        this.subscribers.forEach((unsubscribe) => unsubscribe())
        this.#pending.clear()
        this.mediaCache = null
        this.#general = null
        this.#queries = null
        this.#mappings = null
        this.#userLists = null
        this.#notify = null
        this.#history = null
        this.#pending = null
        this.isCurrent = false
        debug(`Cache with ID ${this.cacheID} has been destroyed.`)
    }

    /**
     * Updates the cache for a specific key.
     * @param {keyof typeof caches} cache - The name of the cache (object store).
     * @param {number|string} key The key for the specific cache entry (e.g., media ID).
     * @param {Object} data The cache object to store.
     * @warn Do not use this outside of {@link Cache}, use {@link cacheEntry} instead.
     */
    #update(cache, key, data) {
        if (cache === caches.USER_LISTS || cache === caches.MAPPINGS) {
            (cache === caches.USER_LISTS ? this.#userLists : this.#mappings).update((query) => {
                query[key] = typeof data === 'function' ? data(current) : data
                return query
            })
        } else {
            this.#queries.update((query) => {
                if (!query[cache.key]) query[cache.key] = {}
                const current = query[cache.key][key]
                query[cache.key][key] = typeof data === 'function' ? data(current) : data
                return query
            })
        }
    }

    /**
     * Transfers all cached data from the current cache to a new cache ID and then purges the old cache.
     * Only keeps necessary info like settings, notifications, watch history, and previous magnet links excluding caches like queries and user lists as they can't be used.
     * @param {string} newCacheID - The ID of the new cache to which data should be transferred.
     * @returns {Promise<void>} Resolves when the data has been successfully transferred and the old cache purged.
     */
    async abandon(newCacheID){
        for (const value of [[caches.GENERAL, this.#general.value], [caches.NOTIFICATIONS, this.#notify.value], [caches.HISTORY, this.#history.value]]) {
            for (const [key, keyValue] of Object.entries(value[1])) {
                await set(newCacheID, value[0], key, keyValue)
            }
        }
        purge(this.cacheID)
    }

    /**
     * Resets all settings completely clearing the general cache.
     * See {@link generalDefaults} for all values that will be reset.
     */
    async resetSettings() {
        await reset(this.cacheID, caches.GENERAL)
        location.reload()
    }

    /**
     * Resets all watch history and magnet links completely clearing the history cache.
     * See {@link historyDefaults} for all values that will be reset.
     */
    async resetHistory() {
        await reset(this.cacheID, caches.HISTORY)
        this.#history.value = { ...historyDefaults }
    }

    /**
     * Resets all caches completely clearing the caches, excluding notifications.
     * To clear notifications see: {@link resetNotifications}.
     *
     * See {@link queryDefaults} for all values that will be reset.
     */
    async resetCaches() {
        await reset(this.cacheID, caches.QUERIES)
        await reset(this.cacheID, caches.MAPPINGS)
        await reset(this.cacheID, caches.USER_LISTS)
        await reset(this.cacheID, caches.MEDIA_CACHE)
        location.reload()
    }

    /**
     * Resets all notifications completely clearing the notifications cache.
     * See {@link notifyDefaults} for all values that will be reset.
     */
    resetNotifications() {
        this.#notify.value = { ...notifyDefaults }
        window.dispatchEvent(new Event('notification-reset'))
    }


    /**
     * Retrieves a cache entry directly from storage.
     * @param {keyof typeof caches} cache - The name of the cache (object store).
     * @param {string} key - The category to retrieve (e.g., 'lastAni').
     * @returns {Promise<any>} The cached data for the specified key, or `undefined` if it does not exist.
     */
    read(cache, key) {
        return get(this.cacheID, cache, key)
    }

    /**
     * Writes a cache entry directly to storage.
     * @param {keyof typeof caches} cache - The name of the cache (object store).
     * @param {string} key - The category to update (e.g., 'lastAni').
     * @param {Object} data The cache object to store.
     * @returns {Promise<void>} Resolves when the data has been successfully updated.
     */
    write(cache, key, data) {
        this.setEntry(cache, key, data)
        return set(this.cacheID, cache, key, data)
    }

    /**
     * Retrieves the cache entry for a specific key.
     * @param {keyof typeof caches} cache - The name of the cache (object store).
     * @param {string} key - The category to retrieve (e.g., 'lastAni').
     * @returns {any} The cached data for the specified key, or `undefined` if it does not exist.
     */
    getEntry(cache, key) {
        return (cache === caches.GENERAL ? this.#general : cache === caches.NOTIFICATIONS ? this.#notify : this.#history).value[key]
    }

    /**
     * Updates the cache for a specific key.
     * @param {keyof typeof caches} cache - The name of the cache (object store).
     * @param {string} key The category to update (e.g., 'lastAni').
     * @param {Object} data The cache object to store.
     */
    setEntry(cache, key, data) {
        (cache === caches.GENERAL ? this.#general : cache === caches.NOTIFICATIONS ? this.#notify : this.#history).update((query) => {
            const current = query[key]
            query[key] = typeof data === 'function' ? data(current) : data
            return query
        })
    }

    /**
     * Updates the media cache with the provided media entries.
     *
     * @param {Array<Object>} medias - An array of media objects to be cached. Each media object should have a unique identifier (`id`).
     * @param {Object} [fillLists] - An object containing user list data to attach to each media entry (e.g., `{ data: { MediaList: [...] } }`)
     * @returns {Promise<void>} Resolves when the media cache has been successfully updated.
     */
    async updateMedia(medias, fillLists) {
        if (!medias) return
        if (fillLists) await Promise.all(medias.map(media => fillEntry(media, fillLists))) // attaches any alternative authorization userList information to the anilist media for tracking.
        const updatedMedias = {}
        for (const media of medias) {
            if (media) updatedMedias[media.id] = media
        }
        this.mediaCache.update((currentCache) => {
            return { ...currentCache, ...updatedMedias }
        })
    }

    /**
     * Retrieves a cached entry by its key, optionally ignoring the expiration time.
     *
     * @param {keyof typeof caches} cache - The name of the cache (object store).
     * @param {string} key - The unique key identifying the cached entry.
     * @param {boolean} [ignoreExpiry=false] - If true, the entry will be returned even if it has expired, defaults to `false`; meaning expired entries will not be returned.
     * @returns {Object|null} The cached entry if found and valid; otherwise, `null`.
     */
    cachedEntry(cache, key, ignoreExpiry) {
        if (this.#pending.has(`${cache.key}:${key}`)) {
            debug(`Found pending query ${cache.key} for ${key}`)
            return this.#pending.get(`${cache.key}:${key}`)
        } else if (cache !== caches.MAPPINGS) {
            const cachedEntry = cache === caches.USER_LISTS ? this.#userLists.value[key] : this.#queries.value[cache.key][key]
            if (cachedEntry && cachedEntry.data && ((Date.now() < cachedEntry.expiry) || ignoreExpiry)) {
                debug(`Found cached ${cache.key} for ${key}`)
                const data = structuredClone(cachedEntry.data)
                if (cache !== caches.RECOMMENDATIONS || this.#general.value.settings.queryComplexity === 'Complex') { // remap media ids to the medias in the cache.
                    if (data.data?.Page?.media) data.data.Page.media = data.data.Page.media.map(mediaId => this.mediaCache.value[mediaId])
                    if (data.data?.Media) data.data.Media = this.mediaCache.value[data.data.Media]
                    if (data.data?.MediaListCollection) data.data.MediaListCollection.lists = (data.data.MediaListCollection.lists || []).map(list => ({ ...list, entries: list.entries.map(entry => ({ ...entry, media: this.mediaCache.value[entry.media] })) }))
                }
                return Promise.resolve(data)
            }
            return null
        } else { // its mappings...
            const cachedEntry = this.#mappings[key]
            if (cachedEntry && cachedEntry.data && ((Date.now() < cachedEntry.expiry) || ignoreExpiry)) {
                const data = structuredClone(cachedEntry.data)
                return Promise.resolve(data)
            }
            return null
        }
    }

    /**
     * Caches an entry with the specified key, variables, data, and expiry time.
     * Only one instance of the function will be run, subsequent identical calls will return the initial call.
     *
     * @param {keyof typeof caches} cache - The name of the cache (object store).
     * @param {string} key - The unique key to identify the cached entry.
     * @param {Object} [vars] - The variables associated with the cached data if applicable, this can include filters, query parameters, or context-specific data.
     * @param {Object} data - The data to be cached, this is the primary content to store for the key. Preferably this should be a promise as it will be handled before caching.
     * @param {number} expiry - The expiration timestamp for the cache entry in milliseconds since the epoch, once the current time exceeds this value the entry is considered expired.
     * @returns {Promise<Object>} A promise that resolves when the caching operation is complete.
     *
     */
    async cacheEntry(cache, key, vars, data, expiry) {
        if (this.#pending.has(`${cache.key}:${key}`)) {
            debug(`Found pending query ${cache.key} for ${key} during cache update...`)
            return this.#pending.get(`${cache.key}:${key}`)
        }
        const { fillLists, ...variables } = vars
        const promiseData = (async () => {
            const res = await data
            const cacheRes = structuredClone(res)
            if (!variables?.mappings && (res.errors && res.errors.length > 0)) return this.cachedEntry(cache, key, true) || res // best to return something rather than nothing...   //!res?.data ||
            if (cache !== caches.RECOMMENDATIONS || this.#general.value.settings.queryComplexity === 'Complex') {
                if (res?.data?.Page?.media) {
                    cacheRes.data.Page.media = cacheRes.data.Page.media.map(media => media.id)
                    await this.updateMedia(res.data.Page.media, await fillLists)
                } else if (res?.data?.Media) {
                    cacheRes.data.Media = cacheRes.data.Media.id
                    await this.updateMedia([res.data.Media], await fillLists)
                } else if (res?.data?.MediaListCollection && !variables.token) {
                    const lists = res.data.MediaListCollection.lists || []
                    cacheRes.data.MediaListCollection = { ...res.data.MediaListCollection, lists: lists.map(list => ({ ...list, entries: list.entries.map(entry => ({ ...entry, media: entry.media.id })) })) }
                    await this.updateMedia(lists.flatMap(list => list.entries.map(entry => entry.media)))
                }
            }
            this.#update(cache, key, { data: cacheRes, expiry, cachedAt: Date.now() })
            return res
        })()
        this.#pending.set(`${cache.key}:${key}`, promiseData)
        setTimeout(() => {
            this.#pending.delete(`${cache.key}:${key}`)
        }, 500)
        return promiseData
    }
}

export let cache

/**
 * Initializes or reinitializes the cache instance. If an existing cache is currently active (`isCurrent` is true),
 * the function destroys the existing cache and creates a new one. Otherwise, it initializes a new cache instance.
 * THIS MUST BE CALLED BEFORE ACCESSING {@link cache}.
 *
 * @function setCache
 * @param {function} subscribe - If the caches should automatically be saved to local storage after a short debounce period.
 * @returns {Promise<void>} - A promise that resolves when the cache is ready (`isReady`).
 */
export function setCache(subscribe) {
    if (cache?.isCurrent) {
        debug('A reload has been detected, attempting to re-initialize the cache!')
        cache.destroy()
        cache = new Cache(subscribe)
    } else {
        cache = new Cache(subscribe)
    }
    return cache.isReady
}
