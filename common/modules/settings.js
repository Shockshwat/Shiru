import { get, writable } from 'simple-store-svelte'
import { defaults } from './util.js'
import IPC from '@/modules/ipc.js'
import { toast } from 'svelte-sonner'
import Debug from '@/modules/debug.js'

const debug = Debug('ui:settings')

/** @type {{viewer: import('./al').Query<{Viewer: import('./al').Viewer}>, token: string} | null} */
export let alToken = JSON.parse(localStorage.getItem('ALviewer')) || null
/** @type {{viewer: import('./mal').Query<{Viewer: import('./mal').Viewer}>, token: string, refresh: string, refresh_in: number, reauth: boolean} | null} */
export let malToken = JSON.parse(localStorage.getItem('MALviewer')) || null

let storedSettings = { ...defaults }

let scopedDefaults

try {
  storedSettings = JSON.parse(localStorage.getItem('settings')) || { ...defaults }
} catch (e) {}
try {
  scopedDefaults = {
    homeSections: [...(storedSettings.rssFeedsNew || defaults.rssFeedsNew).map(([title]) => title), 'Continue Watching', 'Sequels You Missed', 'Planning List', 'Popular This Season', 'Trending Now', 'All Time Popular', 'Romance', 'Action', 'Adventure', 'Fantasy', 'Comedy']
  }
} catch (e) {
  resetSettings()
  location.reload()
}

/**
 * @type {import('simple-store-svelte').Writable<typeof defaults>}
 */
export const settings = writable({ ...defaults, ...scopedDefaults, ...storedSettings })

settings.subscribe(value => {
  localStorage.setItem('settings', JSON.stringify(value))
})

profiles.subscribe(value => {
  localStorage.setItem('profiles', JSON.stringify(value))
})

export function resetSettings () {
  settings.value = { ...defaults, ...scopedDefaults }
}

export function isAuthorized() {
  return alToken || malToken
}

window.addEventListener('paste', ({ clipboardData }) => {
  if (clipboardData.items?.[0]) {
    if (clipboardData.items[0].type === 'text/plain' && clipboardData.items[0].kind === 'string') {
      clipboardData.items[0].getAsString(text => {
        if (text.includes("access_token=")) { // is an AniList token
          let token = text.split('access_token=')?.[1]?.split('&token_type')?.[0]
          if (token) {
            if (token.endsWith('/')) token = token.slice(0, -1)
            handleToken(token)
          }
        } else if (text.includes("code=") && text.includes("&state")) { // is a MyAnimeList authorization
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
  location.reload()
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
  const refresh = currentProfile ? malToken.refresh : get(profiles).find(profile => profile.token === token)?.refresh
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
    const profile = copyConstants({ viewer: viewer }, malToken)
    malToken = { viewer: profile.viewer, token: oauth.access_token, refresh: oauth.refresh_token, refresh_in: refresh_in, reauth: false }
    localStorage.setItem('MALviewer', JSON.stringify({ viewer: profile.viewer, token: oauth.access_token, refresh: oauth.refresh_token, refresh_in: refresh_in, reauth: false }))
  } else {
    profiles.update(profiles =>
        profiles.map(profile => {
          if (profile.token === token) {
            return { viewer: copyConstants({ viewer: viewer }, profile).viewer, token: oauth.access_token, refresh: oauth.refresh_token, refresh_in: refresh_in, reauth: false }
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
  const swapProfile = profile !== null && !get(profiles).some(p => (p.viewer?.data?.Viewer?.id === currentProfile?.viewer?.data?.Viewer?.id))
  if (currentProfile && swapProfile && !newProfile) {
    const torrent = localStorage.getItem('torrent')
    const lastFinished = localStorage.getItem('lastFinished')
    const settings = localStorage.getItem('settings')
    if (torrent) currentProfile.viewer.data.Viewer.torrent = torrent
    if (lastFinished) currentProfile.viewer.data.Viewer.lastFinished = lastFinished
    if (settings) currentProfile.viewer.data.Viewer.settings = settings
    profiles.update(currentProfiles => [currentProfile, ...currentProfiles])
  }

  if (profile === null && get(profiles).length > 0) {
    let firstProfile
    profiles.update(profiles => {
        firstProfile = profiles[0]
        setViewer(firstProfile)
        return profiles.slice(1)
    })
  } else if (profile !== null) {
    if (profile?.viewer?.data?.Viewer?.id === currentProfile?.viewer?.data?.Viewer?.id && newProfile) {
      localStorage.setItem(alToken ? 'ALviewer' : 'MALviewer', JSON.stringify(copyConstants(profile, (alToken ? alToken : malToken))))
      location.reload()
    } else if (get(profiles).some(p => p.viewer?.data?.Viewer?.id === profile?.viewer?.data?.Viewer?.id && newProfile)) {
      profiles.update(profiles => {
        return profiles.map(p => {
          if (p.viewer?.data?.Viewer?.id === profile?.viewer?.data?.Viewer?.id) {
            p = copyConstants(profile, p)
          }
          return p
        })
      })
    } else {
      setViewer(profile)
      profiles.update(profiles =>
          profiles.filter(p => p.viewer?.data?.Viewer?.id !== profile.viewer?.data?.Viewer?.id)
      )
    }
  } else {
    localStorage.removeItem(alToken ? 'ALviewer' : 'MALviewer')
    alToken = null
    malToken = null
  }
}

function setViewer (profile) {
  const { torrent, lastFinished, settings } = profile?.viewer?.data?.Viewer
  if (torrent) {
    localStorage.setItem('torrent', torrent)
  } else if (isAuthorized()) {
    localStorage.removeItem('torrent')
  }
  if (lastFinished) {
    localStorage.setItem('lastFinished', lastFinished)
  } else if (isAuthorized()) {
    localStorage.removeItem('lastFinished')
  }
  if (settings) {
    localStorage.setItem('settings', settings)
  } else if (isAuthorized()) {
    localStorage.setItem('settings', writable({ ...defaults, ...scopedDefaults}))
  }
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

function copyConstants(newProfile, oldProfile) {
  newProfile.viewer.data.Viewer.sync = oldProfile.viewer.data.Viewer.sync
  newProfile.viewer.data.Viewer.settings = oldProfile.viewer.data.Viewer.settings
  newProfile.viewer.data.Viewer.torrent = oldProfile.viewer.data.Viewer.torrent
  newProfile.viewer.data.Viewer.lastFinished = oldProfile.viewer.data.Viewer.lastFinished
  return newProfile
}
