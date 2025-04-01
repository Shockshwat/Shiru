<script>
  import Home from './views/Home/Home.svelte'
  import MediaHandler, { nowPlaying as media } from './views/Player/MediaHandler.svelte'
  import Settings from '@/views/Settings/Settings.svelte'
  import WatchTogether from './views/WatchTogether/WatchTogether.svelte'
  import Miniplayer from './views/Player/Miniplayer.svelte'
  import Search, { search } from './views/Search.svelte'
  import AiringSchedule from './views/AiringSchedule.svelte'

  export let page = 'home'
  export let overlay = []
  export let playPage = false

  $: $search = page === 'search' && $search.scheduleList ? { format: [], format_not: [], status: [], status_not: [] } : { format: [], format_not: [], status: [], status_not: [], ...$search }
  $: visible = !overlay.includes('torrent') && !overlay.includes('notifications') && !overlay.includes('profiles') && !overlay.includes('minimizetray') && !playPage && !$media?.display
</script>
<div class='w-full h-full position-absolute overflow-hidden' class:invisible={!($media && (Object.keys($media).length > 0)) || (playPage && overlay.includes('viewanime')) || (!visible && (page !== 'player'))}>
  <Miniplayer active={($media && (Object.keys($media).length > 0)) && ((page !== 'player' && visible) || (overlay.includes('viewanime') && visible))} class='bg-dark-light z-100 {(page === `player` && !overlay.includes(`viewanime`)) ? `h-full` : ``}' padding='2rem'>
    <MediaHandler miniplayer={page !== 'player' || overlay.includes('viewanime')} bind:page bind:overlay bind:playPage />
  </Miniplayer>
</div>
{#if page === 'settings'}
  <Settings bind:playPage />
{:else if page === 'home'}
  <Home />
{:else if page === 'search'}
  <Search />
{:else if page === 'schedule'}
  <AiringSchedule />
{:else if page === 'watchtogether'}
  <WatchTogether />
{/if}
