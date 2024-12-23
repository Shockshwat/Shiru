import { SUPPORTS } from '@/modules/support.js'
import levenshtein from 'js-levenshtein'
import { writable } from 'svelte/store'
import Fuse from 'fuse.js'

export function countdown (s) {
  const d = Math.floor(s / (3600 * 24))
  s -= d * 3600 * 24
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  const tmp = []
  if (d) tmp.push(d + 'd')
  if (d || h) tmp.push(h + 'h')
  if (d || h || m) tmp.push(m + 'm')
  return tmp.join(' ')
}

const formatter = (typeof Intl !== 'undefined') && new Intl.RelativeTimeFormat('en')
const ranges = {
  years: 3600 * 24 * 365,
  months: 3600 * 24 * 30,
  weeks: 3600 * 24 * 7,
  days: 3600 * 24,
  hours: 3600,
  minutes: 60,
  seconds: 1
}

/**
 * @template T
 * @param {T[]} arr
 * @param {number} n
 */
export function * chunks (arr, n) {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n)
  }
}

/** @param {Date} date */
export function since (date) {
  const secondsElapsed = (date.getTime() - Date.now()) / 1000
  for (const key in ranges) {
    if (ranges[key] < Math.abs(secondsElapsed)) {
      const delta = secondsElapsed / ranges[key]
      // @ts-ignore
      return formatter.format(Math.round(delta), key)
    }
  }
}

/**
 * @param {Date} episodeDate
 * @param {number} weeks The number of weeks past the episodeDate
 * @param {boolean} skip Add the specified number of weeks regardless of the episodeDate having past.
 * @returns {Date}
 */
export function past(episodeDate, weeks = 0, skip) {
  if (episodeDate < new Date() || skip) {
    episodeDate.setDate(episodeDate.getDate() + (7 * weeks))
  }
  return episodeDate
}

const units = [' B', ' kB', ' MB', ' GB', ' TB']
export function fastPrettyBytes (num) {
  if (isNaN(num)) return '0 B'
  if (num < 1) return num + ' B'
  const exponent = Math.min(Math.floor(Math.log(num) / Math.log(1000)), units.length - 1)
  return Number((num / Math.pow(1000, exponent)).toFixed(2)) + units[exponent]
}

/** @type {DOMParser['parseFromString']} */
export const DOMPARSER = (typeof DOMParser !== 'undefined') && DOMParser.prototype.parseFromString.bind(new DOMParser())

export const sleep = t => new Promise(resolve => setTimeout(resolve, t).unref?.())

export function toTS (sec, full) {
  if (isNaN(sec) || sec < 0) {
    switch (full) {
      case 1:
        return '0:00:00.00'
      case 2:
        return '0:00:00'
      case 3:
        return '00:00'
      default:
        return '0:00'
    }
  }
  const hours = Math.floor(sec / 3600)
  /** @type {any} */
  let minutes = Math.floor(sec / 60) - hours * 60
  /** @type {any} */
  let seconds = full === 1 ? (sec % 60).toFixed(2) : Math.floor(sec % 60)
  if (minutes < 10 && (hours > 0 || full)) minutes = '0' + minutes
  if (seconds < 10) seconds = '0' + seconds
  return (hours > 0 || full === 1 || full === 2) ? hours + ':' + minutes + ':' + seconds : minutes + ':' + seconds
}
export function generateRandomHexCode (len) {
  let hexCode = ''

  while (hexCode.length < len) {
    hexCode += (Math.round(Math.random() * 15)).toString(16)
  }

  return hexCode
}

export function generateRandomString(length) {
  let string = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  for (let i = 0; i < length; i++) {
    string += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return string
}

export function getRandomInt(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * @param {Object} nest The nested Object to use for looking up the keys.
 * @param {String} phrase The key phrase to look for.
 * @param {Array} keys Add the specified number of weeks regardless of the episodeDate having past.
 * @param {number} threshold The allowed tolerance, typically for misspellings.
 * @returns {boolean} If the target phrase has been found.
 */
export function matchKeys(nest, phrase, keys, threshold = 0.4) {
  if (!phrase) {
    return true
  }
  const options = {
    includeScore: true,
    threshold,
    keys: keys
  }
  if (new Fuse([nest], options).search(phrase).length > 0) return true
  const fuse = new Fuse([phrase], options)
  return keys.some(key => {
    const valueToMatch = nest[key]
    if (valueToMatch) {
      return fuse.search(valueToMatch).length > 0
    }
    return false
  })
}

export function matchPhrase(search, phrase, threshold) {
  if (!search) return false
  const normalizedSearch = search.toLowerCase().replace(/[^\w\s]/g, '')
  phrase = Array.isArray(phrase) ? phrase : [phrase]

  for (let p of phrase) {
    const normalizedPhrase = p.toLowerCase().replace(/[^\w\s]/g, '')
    if (normalizedSearch.includes(normalizedPhrase)) return true

    const wordsInFileName = normalizedSearch.split(/\s+/)
    for (let word of wordsInFileName) {
      if (levenshtein(word, normalizedPhrase) <= threshold) return true
    }
  }
  return false
}

export function throttle (fn, time) {
  let wait = false
  return (...args) => {
    if (!wait) {
      fn(...args)
      wait = true
      setTimeout(() => {
        fn(...args)
        wait = false
      }, time).unref?.()
    }
  }
}

export function debounce (fn, time) {
  let timeout
  return (...args) => {
    const later = () => {
      timeout = null
      fn(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, time)
    timeout.unref?.()
  }
}

/**
 * General work-around for preventing the reactive animations for specific classes when they are not needed.
 * Importing this and adding {$reactive ? `` : `not-reactive`} will disable reactivity for the added element when a trigger class is clicked.
 *
 * @param {[string]} triggerClasses The classes which need to be clicked to prevent reactivity.
 * @returns { { reactive: Writable<boolean>, init: (create: boolean, boundary?: boolean) => void } } The initializer and reactive listener.
 */
export function createListener(triggerClasses = []) {
  const reactive = writable(true)
  let handling = false
  let bounds = false

  function handleDown({ target }) {
    if (triggerClasses.some(className => target.closest(`.${className}`))) reactive.set(bounds)
    else if (bounds) reactive.set(false)
  }

  function handleUp() {
    reactive.set(true)
  }

  function addListeners() {
    document.addEventListener('mousedown', handleDown, true)
    document.addEventListener('touchstart', handleDown, true)
    if (!bounds) {
      document.addEventListener('mouseup', handleUp, true)
      document.addEventListener('touchend', handleUp, true)
    }
    handling = true
  }

  function removeListeners() {
    document.removeEventListener('mousedown', handleDown, true)
    document.removeEventListener('touchstart', handleDown, true)
    if (!bounds) {
      document.removeEventListener('mouseup', handleUp, true)
      document.removeEventListener('touchend', handleUp, true)
    }
    handling = false
  }

  function init(create, boundary = false) {
    bounds = boundary
    if (create && !handling) addListeners()
    else if (handling) removeListeners()
  }

  return { reactive, init }
}

export const defaults = {
  volume: 1,
  playerAutoplay: true,
  playerPause: true,
  playerAutocomplete: true,
  playerDeband: false,
  adult: 'none',
  rssAutoplay: true,
  rssQuality: '1080',
  rssFeedsNew: SUPPORTS.extensions ? [['New Releases', 'SubsPlease']] : [],
  rssNotify: ['CURRENT', 'PLANNING'],
  rssNotifyDubs: false,
  systemNotify: true,
  aniNotify: 'all',
  releasesNotify: [],
  subAnnounce: 'none',
  dubAnnounce: 'none',
  hentaiAnnounce: 'none',
  customSections: [['Romance', ['Romance'], [], [], []], ['Isekai Comedy', ['Comedy'], ['Isekai'], [], []]],
  torrentSpeed: 5,
  torrentPersist: false,
  torrentDHT: false,
  torrentPeX: false,
  torrentPort: 0,
  torrentStreamedDownload: true,
  dhtPort: 0,
  missingFont: true,
  maxConns: 50,
  subtitleRenderHeight: SUPPORTS.isAndroid ? '720' : '0',
  subtitleLanguage: 'eng',
  audioLanguage: 'jpn',
  enableDoH: false,
  doHURL: 'https://cloudflare-dns.com/dns-query',
  disableSubtitleBlur: SUPPORTS.isAndroid,
  enableRPC: 'full',
  smoothScroll: !SUPPORTS.isAndroid,
  cards: 'small',
  cardAudio: false,
  titleLang: 'romaji',
  hideMyAnime: false,
  toasts: 'All',
  closeAction: 'Prompt',
  queryComplexity: 'Complex',
  expandingSidebar: !SUPPORTS.isAndroid,
  torrentPathNew: undefined,
  donate: true,
  font: undefined,
  angle: 'default',
  toshoURL: SUPPORTS.extensions ? decodeURIComponent(atob('aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ub3JnLw==')) : '',
  extensions: SUPPORTS.extensions ? ['anisearch'] : [],
  sources: {},
  enableExternal: false,
  playerPath: '',
  playerSeek: 2,
  playerSkip: false
}

export const cacheDefaults = {
  recommendations: {},
  following: {},
  episodes: {},
  search: {},
  compound: {},
  searchIDS: {},
  mappings: {},
  medias: {}
}

export const notifyDefaults = {
  lastRSS: {},
  lastAni: 0,
  lastDub: 0,
  lastSub: 0,
  lastHentai: 0,
  dubsDelayed: [],
  announcedDubs: [],
  announcedSubs: [],
  announcedHentais: [],
  notifications: []
}

export const subtitleExtensions = ['srt', 'vtt', 'ass', 'ssa', 'sub', 'txt']
export const subRx = new RegExp(`.(${subtitleExtensions.join('|')})$`, 'i')

export const videoExtensions = ['3g2', '3gp', 'asf', 'avi', 'dv', 'flv', 'gxf', 'm2ts', 'm4a', 'm4b', 'm4p', 'm4r', 'm4v', 'mkv', 'mov', 'mp4', 'mpd', 'mpeg', 'mpg', 'mxf', 'nut', 'ogm', 'ogv', 'swf', 'ts', 'vob', 'webm', 'wmv', 'wtv']
export const videoRx = new RegExp(`.(${videoExtensions.join('|')})$`, 'i')

// freetype supported
export const fontExtensions = ['ttf', 'ttc', 'woff', 'woff2', 'otf', 'cff', 'otc', 'pfa', 'pfb', 'pcf', 'fnt', 'bdf', 'pfr', 'eot']
export const fontRx = new RegExp(`.(${fontExtensions.join('|')})$`, 'i')
