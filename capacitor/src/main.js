import { indexedDB as fakeIndexedDB } from 'fake-indexeddb'
import TorrentClient from 'common/modules/webtorrent.js'
import { cache, caches, setCache } from 'common/modules/cache.js'
import { channel } from 'bridge'
import { env } from 'node:process'
import { statfs } from 'fs/promises'

async function storageQuota (directory) {
  const { bsize, bavail } = await statfs(directory)
  return bsize * bavail
}

if (typeof localStorage === 'undefined') {
  const data = {}
  globalThis.localStorage = {
    setItem: (k, v) => { data[k] = v },
    getItem: (k) => data[k] || null
  }
}

if (typeof indexedDB === 'undefined') {
  globalThis.indexedDB = fakeIndexedDB
}

await setCache(false)
let client
let heartbeatId
function setHeartBeat() {
  heartbeatId = setInterval(() => channel.send('webtorrent-heartbeat'), 500)
}

channel.on('main-heartbeat', () => clearInterval(heartbeatId))
channel.on('port-init', data => {
  cache.setEntry(caches.GENERAL, 'settings', data)
  const port = {
    onmessage: _ => {},
    postMessage: data => {
      channel.send('ipc', { data })
    }
  }
  let storedSettings = {}
  try {
    storedSettings = cache.getEntry(caches.GENERAL, 'settings') || {}
  } catch (error) {}

  channel.on('ipc', a => port.onmessage(a))
  if (!client) {
    client = new TorrentClient(channel, storageQuota, 'node', storedSettings.torrentPathNew || env.TMPDIR)
    setHeartBeat()
    channel.emit('port', {
      ports: [port]
    })
  }
  channel.on('webtorrent-reload', async () => {
    if (client) {
      client.destroy()
      await setCache(false)
      storedSettings = cache.getEntry(caches.GENERAL, 'settings') || {}
      client = new TorrentClient(channel, storageQuota, 'node', storedSettings.torrentPathNew || env.TMPDIR)
      setHeartBeat()
    }
  })
})
