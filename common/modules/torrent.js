import { files, nowPlaying as media } from '../views/Player/MediaHandler.svelte'
import { page } from '@/App.svelte'
import { settings } from '@/modules/settings.js'
import { cache, caches } from '@/modules/cache.js'
import { SUPPORTS } from '@/modules/support.js'
import { toast } from 'svelte-sonner'
import clipboard from './clipboard.js'
import IPC from '@/modules/ipc.js'
import 'browser-event-target-emitter'
import Debug from 'debug'

const debug = Debug('ui:torrent')

const torrentRx = /(^magnet:){1}|(^[A-F\d]{8,40}$){1}|(.*\.torrent$){1}/i

class TorrentWorker extends EventTarget {
  static excludedToastMessages = ['no buffer space']

  constructor () {
    super()
    this.ready = new Promise(resolve => {
      IPC.once('port', () => {
        this.port = window.port
        this.port.onmessage(this.handleMessage.bind(this))
        resolve()
      })
      IPC.emit('portRequest')
    })
    clipboard.on('text', ({ detail }) => {
      for (const { text } of detail) {
        if (page?.value !== 'watchtogether' && torrentRx.exec(text)) {
          media.value = { torrent: true }
          add(text)
          this.dispatch('info', 'A Magnet Link has been detected and is being processed. Files will be loaded shortly...')
        }
      }
    })
    clipboard.on('files', async ({ detail }) => { // doesn't work on Capacitor....
      for (const file of detail) {
        if (file.name.endsWith('.torrent')) {
          media.value = { torrent: true }
          add(new Uint8Array(await file.arrayBuffer()))
        }
      }
    })
  }

  handleMessage ({ data }) {
    this.emit(data.type, data.data)
  }

  async send (type, data, transfer) {
    await this.ready
    debug(`Sending message ${type}`, JSON.stringify(data))
    this.port.postMessage({ type, data }, transfer)
  }
}

export const client = new TorrentWorker()

client.send('load', !settings.value.disableStartupTorrent ? await cache.read(caches.GENERAL, 'loadedTorrent') : null)

client.on('files', ({ detail }) => {
  files.set(detail)
})

client.on('error', ({ detail }) => {
  debug(`Error: ${detail.message || detail}`)
  if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
    for (const exclude of TorrentWorker.excludedToastMessages) {
      if ((detail.message || detail)?.toLowerCase()?.includes(exclude)) return
    }
    toast.error('Torrent Error', {description: '' + (detail.message || detail)})
  }
})

client.on('warn', ({ detail }) => {
  debug(`Warn: ${detail.message || detail}`)
  if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Warnings')) {
    for (const exclude of TorrentWorker.excludedToastMessages) {
      if ((detail.message || detail)?.toLowerCase()?.includes(exclude)) return
    }
    toast.warning('Torrent Warning', {description: '' + (detail.message || detail)})
  }
})

client.on('info', ({ detail }) => {
  debug(`Info: ${detail.message || detail}`)
  for (const exclude of TorrentWorker.excludedToastMessages) {
    if ((detail.message || detail)?.toLowerCase()?.includes(exclude)) return
  }
  toast('Torrent Info', { description: '' + (detail.message || detail) })
})

export async function add (torrentID, search, hide) {
  if (torrentID) {
    debug('Adding torrent', { torrentID })
    if (torrentID.startsWith?.('magnet:')) {
      await cache.write(caches.GENERAL, 'loadedTorrent', JSON.stringify(torrentID))
    } else {
      await cache.write(caches.GENERAL, 'loadedTorrent', torrentID)
    }
    files.set([])
    if (!hide) {
      page.set('player')
      media.value = { media: (search?.media || media.value?.media), episode: (search?.episode || media.value?.episode), ...(media.value?.torrent ? { torrent: true } : { feed: true }) }
      window.dispatchEvent(new Event('overlay-check'))
      if (SUPPORTS.isAndroid) document.querySelector('.content-wrapper').requestFullscreen() // this WILL not work with auto-select torrents due to permissions check.
    }
    client.send(`torrent`, torrentID)
  }
}
// external player for android
client.on('open', ({ detail }) => {
  debug(`Open: ${detail}`)
  IPC.emit('intent', detail)
})

IPC.on('intent-end', () => {
  client.dispatch('externalWatched')
})

window.addEventListener('torrent-unload', () => {
  files.value = []
  media.value = { ...media.value, display: true } // set display to true to allow the "Last Watched" button to remain on the SideBar.
  client.send(`torrent`, null) // this will not override the cached loadedTorrent, we rely on users to enable disableStartupTorrent if they don't want to load the previous torrent when the app starts.
})
