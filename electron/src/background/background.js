import { setCache } from 'common/modules/cache.js'
import { ipcRenderer } from 'electron'
import { statfs } from 'fs/promises'

await setCache(false)
const { default: TorrentClient } = await import('common/modules/webtorrent.js')

async function storageQuota (directory) {
  const { bsize, bavail } = await statfs(directory)
  return bsize * bavail
}

globalThis.client = new TorrentClient(ipcRenderer, storageQuota, 'node')
ipcRenderer.on('webtorrent-reload', async () => {
  await setCache(false)
  globalThis.client.destroy()
  globalThis.client = new TorrentClient(ipcRenderer, storageQuota, 'node')
})