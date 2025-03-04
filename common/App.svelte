<script context='module'>
  import { setContext } from 'svelte'
  import { writable } from 'simple-store-svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import IPC from '@/modules/ipc.js'
  import { rss } from './views/TorrentSearch/TorrentModal.svelte'
  import { SUPPORTS } from '@/modules/support.js'

  export const page = writable('home')
  export const overlay = writable([])
  export const view = writable(null)
  export async function handleAnime (detail) {
    IPC.emit('window-show')
    view.set(null)
    view.set((await anilistClient.searchIDSingle(!detail.mal ? { id: detail.id } : { idMal: detail.id })).data.Media)
  }
  IPC.on('open-anime', handleAnime)
  window.addEventListener('open-anime', (event) => handleAnime(event.detail))
  IPC.on('schedule', () => {
    page.set('schedule')
  })

  let ignoreNext = false
  function addPage (value, type) {
    if (ignoreNext) {
      ignoreNext = false
      return
    }
    history.pushState({ type, value }, '', location.origin + location.pathname + '?id=' + Math.trunc(Math.random() * Number.MAX_SAFE_INTEGER).toString())
  }
  page.subscribe((value) => {
    if (value !== null) addPage(value, 'page')
  })
  view.subscribe((value) => {
    if (value !== null) addPage(value, 'view')
  })

  let minimizeApp
  window.addEventListener('popstate', e => {
    const { state } = e
    if (!state) {
      addPage('home', 'page')
      if (minimizeApp) {
        minimizeApp = false
        if (SUPPORTS.isAndroid) window.Capacitor.Plugins.App.minimizeApp() // any type of force exit of the app causes WebView to crash... this IS a CHROME bug! So the next time the user tries to open the app, it will close requiring them to open it again... #minimizeApp is a paused state so this is preferred instead.
      } else {
        minimizeApp = true
        setTimeout(() => minimizeApp = false, 1000)
      }
      return
    }
    ignoreNext = true
    view.set(null)
    rss.set(null)
    if (document.fullscreenElement) document.exitFullscreen()
    if (state.type === 'page') page.set(state.value)
    else view.set(state.value)
  })
</script>

<script>
  import Sidebar from './components/Sidebar.svelte'
  import Router from './Router.svelte'
  import ViewAnime from './views/ViewAnime/ViewAnime.svelte'
  import TorrentModal from './views/TorrentSearch/TorrentModal.svelte'
  import Menubar from './components/Menubar.svelte'
  import { Toaster } from 'svelte-sonner'
  import Profiles from './components/Profiles.svelte'
  import Notifications from './components/Notifications.svelte'
  import MinimizeTray from './components/MinimizeTray.svelte'
  import Navbar from './components/Navbar.svelte'

  setContext('view', view)
</script>

<div class='page-wrapper with-transitions bg-dark position-relative' data-sidebar-type='overlayed-all'>
  <Menubar bind:page={$page} />
  <Sidebar bind:page={$page} />
  <Navbar bind:page={$page} />
  <div class='overflow-hidden content-wrapper h-full'>
    <Toaster visibleToasts={2} position='top-right' theme='dark' richColors duration={10000} closeButton />
    <Profiles bind:overlay={$overlay} />
    <Notifications bind:overlay={$overlay} />
    <ViewAnime bind:overlay={$overlay} />
    <TorrentModal bind:overlay={$overlay} />
    <MinimizeTray bind:overlay={$overlay} />
    <Router bind:page={$page} bind:overlay={$overlay} />
  </div>
</div>

<style>
  .content-wrapper {
    will-change: width;
    white-space: pre-line;
    top: 0 !important;
  }

  .page-wrapper > .content-wrapper {
    margin-left: var(--sidebar-minimised) !important;
    width: calc(100% - var(--sidebar-minimised)) !important;
    transition: none !important;
  }
  .page-wrapper {
    height: calc(100% - var(--navbar-height)) !important;
  }
</style>
