import 'quartermoon/css/quartermoon-variables.css'
import '@fontsource-variable/nunito'
import IPC from '@/modules/ipc.js'
import { setCache } from '@/modules/cache.js'
import { SUPPORTS } from '@/modules/support.js'
import './css.css'

async function app() {
    isReady = true
    const { default: App } = await import('./App.svelte')
    new App({ target: document.body })
}

await setCache(true)

let isReady = false
if (SUPPORTS.isAndroid) await app()

IPC.on('webtorrent-heartbeat', async () => {
    if (!isReady) await app()
    IPC.emit('main-heartbeat')
})
