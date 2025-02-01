import TorrentClient from 'common/modules/webtorrent.js'
import { setCache } from 'common/modules/cache.js'
import { ipcRenderer } from 'electron'
import { statfs } from 'fs/promises'

async function storageQuota (directory) {
  const { bsize, bavail } = await statfs(directory)
  return bsize * bavail
}

await setCache(false)
globalThis.client = new TorrentClient(ipcRenderer, storageQuota, 'node')

let heartbeatId
function setHeartBeat() {
  heartbeatId = setInterval(() => ipcRenderer.send('webtorrent-heartbeat'), 10)
}
setHeartBeat()

ipcRenderer.on('main-heartbeat', () => clearInterval(heartbeatId))
ipcRenderer.on('webtorrent-reload', async () => {
  globalThis.client.destroy()
  await setCache(false)
  globalThis.client = new TorrentClient(ipcRenderer, storageQuota, 'node')
  setHeartBeat()
})