<script>
  import { getContext } from 'svelte'
  import { rss } from '@/views/TorrentSearch/TorrentModal.svelte'
  import { nowPlaying as media } from '@/views/Player/MediaHandler.svelte'
  import { profileView } from './Profiles.svelte'
  import { notifyView, hasUnreadNotifications } from './Notifications.svelte'
  import { actionPrompt } from './MinimizeTray.svelte'
  import { settings } from '@/modules/settings.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { toast } from 'svelte-sonner'
  import Helper from '@/modules/helper.js'
  import IPC from '@/modules/ipc.js'
  import SidebarLink from './SidebarLink.svelte'
  import { Clock, Download, Heart, Home, ListVideo, TvMinimalPlay, LogIn, Settings, Users, Bell, BellDot } from 'lucide-svelte'
  import { MagnifyingGlass } from 'svelte-radix'

  let updateState = ''

  IPC.on('update-available', () => {
    updateState = 'downloading'
  })
  IPC.on('update-downloaded', () => {
    updateState = 'ready'
  })

  const view = getContext('view')
  const btnSize = !SUPPORTS.isAndroid ? '3.1rem' : '3.4rem'

  export let page
  export let playPage
</script>

<div class='sidebar z-30 d-md-block' class:animated={$settings.expandingSidebar}>
  <div class='sidebar-overlay pointer-events-none h-full position-absolute' />
  <div class='sidebar-menu h-full d-flex flex-column justify-content-center align-items-center m-0 pb-5 animate' class:br-10={!$settings.expandingSidebar} class:pt-100={!SUPPORTS.isAndroid}>
    {#if !SUPPORTS.isAndroid}
      <SidebarLink click={() => { $profileView = !$profileView }} icon='login' text={Helper.getUser() ? 'Profiles' : 'Login'} css='{!SUPPORTS.isAndroid ? `mt-auto` : ``}' {page} overlay={!$notifyView && !$actionPrompt && $profileView && 'profile'} nowPlaying={$view} image={Helper.getUserAvatar()}>
        <LogIn size={btnSize} class='flex-shrink-0 p-5 m-5 rounded' />
      </SidebarLink>
    {/if}
    <SidebarLink click={() => { page = 'home'; if ($view) $view = null }} _page='home' text='Home' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Home size={btnSize} class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
    </SidebarLink>
    <SidebarLink click={() => { page = 'search'; if ($view) $view = null }} _page='search' text='Search' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <MagnifyingGlass size={btnSize} class='flex-shrink-0 m-5 rounded' stroke-width='0.5' stroke='currentColor' style='padding: 0.3rem !important; color: {page===`search` && !($view || $profileView || $notifyView || $actionPrompt || $rss) ? `currentColor`:`#5e6061`}' />
    </SidebarLink>
    <SidebarLink click={() => { page = 'schedule' }} _page='schedule' icon='schedule' text='Schedule' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Clock size={btnSize} class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
    </SidebarLink>
    {#if $media?.media}
      {@const currentMedia = $view}
      {@const active = $view && !$notifyView && !$profileView && !$actionPrompt && 'active'}
      {@const wasOverlay = ($view || $profileView || $notifyView || $actionPrompt || $rss)}
      <SidebarLink click={() => {
        if (playPage && (page === 'player') && !wasOverlay) {
          playPage = false
        }
        if (playPage) {
          page = 'player'
        } else {
          $view = (currentMedia?.id === $media?.media.id && active ? null : $media?.media)
        }
      }} rbClick={() => { $view = (currentMedia?.id === $media?.media.id && active ? null : $media?.media) }} _page={playPage ? 'player' : ''} icon='queue_music' text={$media?.display ? 'Last Watched' : 'Now Playing'} {page} overlay={active} nowPlaying={!playPage && ($view?.id === $media?.media?.id)} let:active>
        <svelte:component this={playPage ? TvMinimalPlay : ListVideo} size={btnSize} class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
      </SidebarLink>
    {/if}
    <SidebarLink click={() => { page = 'watchtogether' }} _page='watchtogether' icon='groups' text='Watch Together' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Users size={btnSize} class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
    </SidebarLink>
    {#if $settings.donate && !SUPPORTS.isAndroid}
      <SidebarLink click={() => { IPC.emit('open', 'https://github.com/sponsors/RockinChaos/') }} icon='favorite' text='Support This App' css='{!SUPPORTS.isAndroid ? `mt-auto` : ``}' {page} let:active>
        <Heart size={btnSize} class='flex-shrink-0 p-5 m-5 rounded donate' strokeWidth='2.5' fill='currentColor' />
      </SidebarLink>
    {/if}
    {#if updateState === 'downloading'}
      <SidebarLink click={() => { toast('Update is downloading...', { description: 'This may take a moment, the update will be ready shortly.' }) }} icon='download' text='Update Downloading...' css='{!$settings.donate && !SUPPORTS.isAndroid ? `mt-auto` : ``}' {page} let:active>
        <Download size={btnSize} class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
      </SidebarLink>
    {:else if updateState === 'ready'}
      <SidebarLink click={() => { IPC.emit('quit-and-install') }} icon='download' text='Update Ready!' css='{!$settings.donate && !SUPPORTS.isAndroid ? `mt-auto` : ``}' {page} let:active>
        <Download size={btnSize} class='flex-shrink-0 p-5 m-5 rounded update' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
      </SidebarLink>
    {/if}
    <SidebarLink click={() => { $notifyView = !$notifyView }} icon='bell' text='Notifications' css='{!$settings.donate && !SUPPORTS.isAndroid && updateState !== `downloading` && updateState !== `ready` ? `mt-auto` : ``}' {page} overlay={!$actionPrompt && $notifyView && 'notify'} nowPlaying={$view} let:active>
      {#if $hasUnreadNotifications && $hasUnreadNotifications > 0}
        <BellDot size={btnSize} class='flex-shrink-0 p-5 m-5 rounded notify' strokeWidth='2.5' color={$notifyView ? 'white' : 'currentColor'} />
      {:else}
        <Bell size={btnSize} class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
      {/if}
    </SidebarLink>
    <SidebarLink click={() => { page = 'settings' }} _page='settings' icon='settings' text='Settings' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Settings size={btnSize} class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
    </SidebarLink>
  </div>
</div>

<style>
  .sidebar .animate :global(.donate) {
    animation: pink_glow 1s ease-in-out infinite alternate;
  }
  .sidebar .animate :global(.notify) {
    animation: purple_glow 1s ease-in-out infinite alternate, bell_shake 10s infinite;
  }
  :global(.update) {
    color: #47cb6a;
    font-variation-settings: 'FILL' 1;
  }
  .sidebar :global(.donate):hover {
    color: #fa68b6 !important;
  }
  .sidebar :global(.donate) {
    font-variation-settings: 'FILL' 1;
    color: #fa68b6;
    text-shadow: 0 0 1rem #fa68b6;
  }
  @keyframes pink_glow {
    from {
      filter: drop-shadow(0 0 1rem #fa68b6);
    }
    to {
      filter: drop-shadow(0 0 0.5rem #fa68b6);
    }
  }
  .sidebar :global(.notify):hover {
    color: #af68fa !important;
  }
  .sidebar :global(.notify) {
    font-variation-settings: 'FILL' 1;
    color: #af68fa;
    text-shadow: 0 0 1rem #af68fa;
  }
  @keyframes purple_glow {
    from {
      filter: drop-shadow(0 0 2rem #af68fa);
    }
    to {
      filter: drop-shadow(0 0 0.2rem #af68fa);
    }
  }
  @keyframes bell_shake {
    0%, 7.5% {
      transform: rotate(0deg);
    }
    1.5% {
      transform: rotate(-15deg);
    }
    3% {
      transform: rotate(15deg);
    }
    4.5% {
      transform: rotate(-10deg);
    }
    6% {
      transform: rotate(10deg);
    }
  }
  .pt-100 {
    padding-top: 10rem;
  }

  .sidebar {
    transition: width .8s cubic-bezier(0.25, 0.8, 0.25, 1), left .8s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
    background: none !important;
    overflow-y: unset;
    overflow-x: visible;
    left: unset;
  }
  .sidebar.animated:hover {
    width: 22rem
  }
  .sidebar.animated {
    z-index: 60 !important;
  }
  .sidebar-overlay {
    width: var(--sidebar-width);
    transition: width .8s cubic-bezier(0.25, 0.8, 0.25, 1), left .8s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
    background: var(--sidebar-gradient);
    backdrop-filter: blur(2px);
    z-index: -1;
  }
  .sidebar.animated:hover .sidebar-overlay {
    width: 63rem
  }
  .br-10 {
    border-right: .10rem rgba(182, 182, 182, 0.13) solid !important;
  }
</style>
