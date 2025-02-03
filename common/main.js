import 'quartermoon/css/quartermoon-variables.css'
import '@fontsource-variable/nunito'
import { setCache } from '@/modules/cache.js'
import './css.css'

await setCache(true)
const { default: App } = await import('./App.svelte')
new App({ target: document.body })
