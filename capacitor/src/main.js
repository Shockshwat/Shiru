import TorrentClient from 'common/modules/webtorrent.js'
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

let client

channel.on('port-init', data => {
  localStorage.setItem(`settings_${TorrentClient.cacheID}`, data)
  const port = {
    onmessage: _ => {},
    postMessage: data => {
      channel.send('ipc', { data })
    }
  }
  let storedSettings = {}

  try {
    storedSettings = JSON.parse(localStorage.getItem(`settings_${TorrentClient.cacheID}`)) || {}
  } catch (error) {}

  channel.on('ipc', a => port.onmessage(a))
  if (!client) {
    client = new TorrentClient(channel, storageQuota, 'node', storedSettings.torrentPathNew || env.TMPDIR)

    channel.emit('port', {
      ports: [port]
    })
  }
  channel.on('webtorrent-reload', () => {
    if (client) {
      client.destroy()
      storedSettings = JSON.parse(localStorage.getItem(`settings_${TorrentClient.cacheID}`)) || {}
      client = new TorrentClient(channel, storageQuota, 'node', storedSettings.torrentPathNew || env.TMPDIR)
    }
  })
})
