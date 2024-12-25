import { writable } from 'simple-store-svelte'
import { debounce, defaults, cacheDefaults, notifyDefaults } from '@/modules/util.js'
import IPC from '@/modules/ipc.js'
import { toast } from 'svelte-sonner'
import Debug from 'debug'

const debug = Debug('ui:settings')

/** @type {{viewer: import('./al').Query<{Viewer: import('./al').Viewer}>, token: string} | null} */
export let alToken = JSON.parse(localStorage.getItem('ALviewer')) || null
/** @type {{viewer: import('./mal').Query<{Viewer: import('./mal').Viewer}>, token: string, refresh: string, refresh_in: number, reauth: boolean} | null} */
export let malToken = JSON.parse(localStorage.getItem('MALviewer')) || null

export let cacheID = alToken ? alToken.viewer.data.Viewer.id : malToken ? malToken.viewer.data.Viewer.id : 'default'

let storedSettings = { ...defaults }

let scopedDefaults

try {
  storedSettings = JSON.parse(localStorage.getItem(`settings_${cacheID}`)) || { ...defaults }
} catch (e) {}
try {
  scopedDefaults = {
    homeSections: [...(storedSettings.rssFeedsNew || defaults.rssFeedsNew).map(([title]) => [title, ['N/A'], ['N/A']]), ...(storedSettings.customSections || defaults.customSections).map(([title]) => [title, 'TRENDING_DESC', ['TV', 'MOVIE']]), ['Subbed Releases', 'N/A', ['TV', 'MOVIE', 'OVA', 'ONA']], ['Dubbed Releases', 'N/A', ['TV', 'MOVIE', 'OVA', 'ONA']], ['Continue Watching', 'UPDATED_TIME_DESC',  []], ['Sequels You Missed', 'POPULARITY_DESC',  []], ['Planning List', 'POPULARITY_DESC',  []], ['Popular This Season', 'N/A', ['TV', 'MOVIE']], ['Trending Now', 'N/A', ['TV', 'MOVIE']], ['All Time Popular', 'N/A', ['TV', 'MOVIE']]]
  }
} catch (e) {
  resetSettings()
  location.reload()
}

/** @type {import('simple-store-svelte').Writable<number[]>} */
export const sync = writable(JSON.parse(localStorage.getItem(`sync_${cacheID}`)) || [])

sync.subscribe(value => {
  localStorage.setItem(`sync_${cacheID}`, JSON.stringify(value))
})

/** @type {import('simple-store-svelte').Writable<typeof defaults>} */
export const settings = writable({ ...defaults, ...scopedDefaults, ...storedSettings })

settings.subscribe(value => {
  localStorage.setItem(`settings_${cacheID}`, JSON.stringify(value))
})

export function resetSettings () {
  settings.value = { ...defaults, ...scopedDefaults }
}

/** @type {import('svelte/store').Writable<{ lastRSS: any, lastAni: number, lastDub: number, announcedDubs: any, notifications: any }>} */
export const notify = writable({ ...notifyDefaults, ...(JSON.parse(localStorage.getItem(`notify_${cacheID}`)) || {}) })
const debounceNotify = debounce(value => localStorage.setItem(`notify_${cacheID}`, JSON.stringify(value)), 4500)
notify.subscribe(value => {
  debounceNotify(value)
})

export function resetNotifications() {
  notify.value = { ...notifyDefaults }
  window.dispatchEvent(new Event('notification-reset'))
  localStorage.setItem(`notify_${cacheID}`, JSON.stringify(notify.value))
}

/**
 * Updates the notifications for a specific route.
 * @param {string} route The route or category to update (e.g., 'recommendations').
 * @param {Object} cacheData The cache object to store.
 */
export function updateNotify(route, cacheData) {
  notify.update((cache) => {
    const current = cache[route]
    cache[route] = typeof cacheData === 'function' ? cacheData(current) : cacheData
    return cache
  })
}

/** @type {import('svelte/store').Writable<{ recommendations: Record<string, any>, following: Record<string, any>, episodes: Record<string, any>, search: Record<string, any>, compound: Record<string, any>, searchIDS: Record<string, any>, notifications: Record<string, any>, medias: Record<number, import('./al.d.ts').Media>, }>} */
export const caches = writable({ ...cacheDefaults, ...(JSON.parse(localStorage.getItem(`caches_${cacheID}`)) || {}) })
const swappingProfile = writable(false)
window.onbeforeunload = function () {
  IPC.emit('webtorrent-reload')
  if (!swappingProfile.value) localStorage.setItem(`caches_${cacheID}`, JSON.stringify(caches.value))
}

export function resetCaches () {
  caches.value = { ...cacheDefaults }
  localStorage.setItem(`caches_${cacheID}`, JSON.stringify(caches.value))
}

/**
 * Updates the cache for a specific route.
 * @param {string} route The route or category to update (e.g., 'recommendations').
 * @param {number|string} key The key for the specific cache entry (e.g., media ID).
 * @param {Object} cacheData The cache object to store.
 */
export function updateCache(route, key, cacheData) {
  caches.update((cache) => {
    if (!cache[route]) cache[route] = {}
    const current = cache[route][key]
    cache[route][key] = typeof cacheData === 'function' ? cacheData(current) : cacheData
    return cache
  })
}

/** @type {import('simple-store-svelte').Writable<typeof defaults>} */
export const profiles = writable(JSON.parse(localStorage.getItem('profiles')) || [])

profiles.subscribe(value => {
  localStorage.setItem('profiles', JSON.stringify(value))
})

export function isAuthorized() {
  return alToken || malToken
}

window.addEventListener('paste', ({ clipboardData }) => {
  if (clipboardData.items?.[0]) {
    if (clipboardData.items[0].type === 'text/plain' && clipboardData.items[0].kind === 'string') {
      clipboardData.items[0].getAsString(text => {
        if (text.includes('access_token=')) { // is an AniList token
          let token = text.split('access_token=')?.[1]?.split('&token_type')?.[0]
          if (token) {
            if (token.endsWith('/')) token = token.slice(0, -1)
            handleToken(token)
          }
        } else if (text.includes('code=') && text.includes('&state')) { // is a MyAnimeList authorization
          let code = text.split('code=')[1].split('&state')[0]
          let state = text.split('&state=')[1]
          if (code && state) {
            if (code.endsWith('/')) code = code.slice(0, -1)
            if (state.endsWith('/')) state = state.slice(0, -1)
            if (state.includes('%')) state = decodeURIComponent(state)
            // remove linefeed characters from the state
            code = code.replace(/(\r\n|\n|\r)/gm, '')
            state = state.replace(/(\r\n|\n|\r)/gm, '')
            handleMalToken(code, state)
          }
        } else {
          const anilistRegex = /(?:https?:\/\/)?anilist\.co\/anime\/(\d+)/
          const malRegex = /(?:https?:\/\/)?myanimelist\.net\/anime\/(\d+)/
          const anilistMatch = text.match(anilistRegex)
          const malMatch = text.match(malRegex)
          let protocol = text
          if (anilistMatch) {
            protocol = `shiru://anime/${anilistMatch[1]}`
          } else if (malMatch) {
            protocol = `shiru://anime/${malMatch[1]}`
          }
          IPC.emit('handle-protocol', protocol)
        }
      })
    }
  }
})
IPC.on('altoken', handleToken)
async function handleToken (token) {
  const { anilistClient } = await import('./anilist.js')
  const viewer = await anilistClient.viewer({token})
  if (!viewer.data?.Viewer) {
    toast.error('Failed to sign in with AniList. Please try again.', {description: JSON.stringify(viewer)})
    debug(`Failed to sign in with AniList: ${JSON.stringify(viewer)}`)
    return
  }
  swapProfiles({token, viewer}, true)
}

IPC.on('maltoken', handleMalToken)
async function handleMalToken (code, state) {
  const { clientID, malClient } = await import('./myanimelist.js')
  if (!state || !code) {
    toast.error('Failed to sign in with MyAnimeList. Please try again.')
    debug(`Failed to get the state and code from MyAnimeList.`)
    return
  }
  const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
        client_id: clientID,
        grant_type: 'authorization_code',
        code: code,
        code_verifier: sessionStorage.getItem(state)
    })
  })
  if (!response.ok) {
    toast.error('Failed to sign in with MyAnimeList. Please try again.', { description: JSON.stringify(response.status) })
    debug(`Failed to get MyAnimeList User Token: ${JSON.stringify(response)}`)
    return
  }
  const oauth = await response.json()
  const viewer = await malClient.viewer(oauth.access_token)
  if (!viewer?.data?.Viewer?.id) {
    toast.error('Failed to sign in with MyAnimeList. Please try again.', { description: JSON.stringify(viewer) })
    debug(`Failed to sign in with MyAnimeList: ${JSON.stringify(viewer)}`)
    return
  } else if (!viewer?.data?.Viewer?.picture) {
    viewer.data.Viewer.picture = 'https://cdn.myanimelist.net/images/kaomoji_mal_white.png' // set default image if user doesn't have an image.
  }
  swapProfiles({ token: oauth.access_token, refresh: oauth.refresh_token, refresh_in: Math.floor((Date.now() + 14 * 24 * 60 * 60 * 1000) / 1000), reauth: false, viewer }, true)
}

export async function refreshMalToken (token) {
  const { clientID } = await import('./myanimelist.js')
  const currentProfile = malToken?.token === token
  const refresh = currentProfile ? malToken.refresh : profiles.value.find(profile => profile.token === token)?.refresh
  debug(`Attempting to refresh authorization token ${token} with the refresh token ${refresh}`)
  let response
  if (refresh && refresh.length > 0) {
    response = await fetch('https://myanimelist.net/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientID,
        grant_type: 'refresh_token',
        refresh_token: refresh
      })
    })
  }
  if (!refresh || refresh.length <= 0 || !response?.ok) {
    if (currentProfile && !malToken.reauth) {
      toast.error('Failed to re-authenticate with MyAnimeList. You will need to log in again.', {description: JSON.stringify(response?.status || response)})
    }
    debug(`Failed to refresh MyAnimeList User Token ${ !refresh || refresh.length <= 0 ? 'as the refresh token could not be fetched!' : 'the refresh token has likely expired: ' + JSON.stringify(response)}`)
    if (currentProfile) {
      malToken.reauth = true
      localStorage.setItem('MALviewer', JSON.stringify(malToken))
    } else {
      profiles.update(profiles => profiles.map(profile => profile.token === token ? { ...profile, reauth: true } : profile))
    }
    return
  }
  const oauth = await response.json()
  const { malClient } = await import('./myanimelist.js')
  const viewer = await malClient.viewer(oauth.access_token)
  const refresh_in = Math.floor((Date.now() + 14 * 24 * 60 * 60 * 1000) / 1000)
  if (malToken?.token === token) {
    malToken = { viewer: viewer, token: oauth.access_token, refresh: oauth.refresh_token, refresh_in: refresh_in, reauth: false }
    localStorage.setItem('MALviewer', JSON.stringify(malToken))
  } else {
    profiles.update(profiles =>
        profiles.map(profile => {
          if (profile.token === token) {
            return { viewer: viewer, token: oauth.access_token, refresh: oauth.refresh_token, refresh_in: refresh_in, reauth: false }
          }
          return profile
        })
    )
  }
  debug(`Successfully refreshed authorization token, updated to token ${oauth.access_token} with the refresh token ${oauth.refresh_token}`)
  return oauth
}

export function swapProfiles(profile, newProfile) {
  const currentProfile = isAuthorized()
  const keys = [
    'torrent',
    'lastFinished',
    'lastMagnet',
    'settings',
    'notify',
    'caches',
    'animeEpisodeProgress',
    'theme',
    'volume'
  ]

  if (!isAuthorized() && profile !== null) {
    keys.forEach(key => {
      const defaultKey = `${key}_default`
      const value = localStorage.getItem(defaultKey)
      if (value !== null) localStorage.setItem(`${key}_${profile.viewer.data.Viewer.id}`, value)
      else localStorage.removeItem(defaultKey)
    })
  }

  if (profile === null && profiles.value.length > 0) {
    swappingProfile.set(true)
    let firstProfile
    profiles.update(profiles => {
        firstProfile = profiles[0]
        setViewer(firstProfile)
        return profiles.slice(1)
    })
  } else if (profile !== null) {
    swappingProfile.set(true)
    if (profile?.viewer?.data?.Viewer?.id === currentProfile?.viewer?.data?.Viewer?.id && newProfile) {
      localStorage.setItem(alToken ? 'ALviewer' : 'MALviewer', profile)
    } else if (profiles.value.some(p => p.viewer?.data?.Viewer?.id === profile?.viewer?.data?.Viewer?.id && newProfile)) {
      profiles.update(profiles => profiles.map(p => p.viewer?.data?.Viewer?.id === profile?.viewer?.data?.Viewer?.id ? profile : p))
    } else {
      if (currentProfile) profiles.update(currentProfiles => [currentProfile, ...currentProfiles])
      setViewer(profile)
      profiles.update(profiles => profiles.filter(p => p.viewer?.data?.Viewer?.id !== profile.viewer?.data?.Viewer?.id))
    }
  } else {
    swappingProfile.set(true)
    keys.forEach(key => {
      const currentKey = `${key}_${cacheID}`
      const value = localStorage.getItem(currentKey)
      if (value !== null) localStorage.setItem(`${key}_default`, value)
      else localStorage.removeItem(currentKey)
    })
    localStorage.removeItem(alToken ? 'ALviewer' : 'MALviewer')
    alToken = null
    malToken = null
  }
  location.reload()
}

function setViewer (profile) {
  localStorage.removeItem(alToken ? 'ALviewer' : 'MALviewer')
  if (profile?.viewer?.data?.Viewer?.avatar) {
    alToken = profile
    malToken = null
  } else {
    malToken = profile
    alToken = null
  }
  localStorage.setItem(profile.viewer?.data?.Viewer?.avatar ? 'ALviewer' : 'MALviewer', JSON.stringify(profile))
}
