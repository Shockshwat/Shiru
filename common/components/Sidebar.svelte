<script>
  import { getContext } from 'svelte'
  import { rss } from '@/views/TorrentSearch/TorrentModal.svelte'
  import { nowPlaying as media } from '@/views/Player/MediaHandler.svelte'
  import { profileView } from './Profiles.svelte'
  import { notifyView, hasUnreadNotifications } from './Notifications.svelte'
  import { actionPrompt } from './MinimizeTray.svelte'
  import { settings } from '@/modules/settings.js'
  import { toast } from 'svelte-sonner'
  import Helper from '@/modules/helper.js'
  import IPC from '@/modules/ipc.js'
  import SidebarLink from './SidebarLink.svelte'
  import { Clock, Download, Heart, Home, ListVideo, LogIn, Settings, Users, Bell, BellDot } from 'lucide-svelte'
  import { MagnifyingGlass } from 'svelte-radix'

  let updateState = ''

  IPC.on('update-available', () => {
    updateState = 'downloading'
  })
  IPC.on('update-downloaded', () => {
    updateState = 'ready'
  })

  const view = getContext('view')

  export let page
</script>

<div class='sidebar z-30 d-md-block' class:animated={$settings.expandingSidebar}>
  <div class='sidebar-overlay pointer-events-none h-full position-absolute' />
  <div class='sidebar-menu h-full d-flex flex-column justify-content-center align-items-center m-0 pb-5 animate'>
    <SidebarLink click={() => { $profileView = !$profileView }} icon='login' text={Helper.getUser() ? 'Profiles' : 'Login'} css='mt-auto' {page} overlay={!$notifyView && !$actionPrompt && $profileView && 'profile'} nowPlaying={$view === $media.media} image={Helper.getUserAvatar()}>
      <LogIn size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' />
    </SidebarLink>
    <SidebarLink click={() => { page = 'home'; if ($view) $view = null }} _page='home' text='Home' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Home size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
    </SidebarLink>
    <SidebarLink click={() => { page = 'search'; if ($view) $view = null }} _page='search' text='Search' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <MagnifyingGlass size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' stroke-width={active ? '1' : '0'} stroke='currentColor' />
    </SidebarLink>
    <SidebarLink click={() => { page = 'schedule' }} _page='schedule' icon='schedule' text='Schedule' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Clock size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
    </SidebarLink>
    {#if $media?.media}
      {@const currentMedia = $view}
      {@const active = $view && !$notifyView && !$profileView && !$actionPrompt && 'active'}
      <SidebarLink click={() => { $view = (currentMedia?.id === $media.media.id && active ? null : $media.media) }} icon='queue_music' text='Now Playing' {page} overlay={active} nowPlaying={$view === $media.media} let:active>
        <ListVideo size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
      </SidebarLink>
    {/if}
    <SidebarLink click={() => { page = 'watchtogether' }} _page='watchtogether' icon='groups' text='Watch Together' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Users size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
    </SidebarLink>
    {#if $settings.donate}
      <SidebarLink click={() => { IPC.emit('open', 'https://github.com/sponsors/RockinChaos/') }} icon='favorite' text='Support This App' css='mt-auto' {page} let:active>
        <Heart size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded donate' strokeWidth={active ? '3' : '2'} fill='currentColor' />
      </SidebarLink>
    {/if}
    {#if updateState === 'downloading'}
      <SidebarLink click={() => { toast('Update is downloading...') }} icon='download' text='Update Downloading...' css='{!$settings.donate ? `mt-auto` : ``}' {page} let:active>
        <Download size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
      </SidebarLink>
    {:else if updateState === 'ready'}
      <SidebarLink click={() => { IPC.emit('quit-and-install') }} icon='download' text='Update Ready!' css='{!$settings.donate ? `mt-auto` : ``}' {page} let:active>
        <Download size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded update' strokeWidth={active ? '3' : '2'} />
      </SidebarLink>
    {/if}
    <SidebarLink click={() => { $notifyView = !$notifyView }} icon='bell' text='Notifications' css='{!$settings.donate && updateState !== `downloading` && updateState !== `ready` ? `mt-auto` : ``}' {page} overlay={!$actionPrompt && $notifyView && 'notify'} nowPlaying={$view === $media.media} let:active>
      {#if $hasUnreadNotifications}
        <BellDot size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded notify' strokeWidth={active ? '3' : '2'} />
      {:else}
        <Bell size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
      {/if}
    </SidebarLink>
    <SidebarLink click={() => { page = 'settings' }} _page='settings' icon='settings' text='Settings' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Settings size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
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
  .sidebar-menu {
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
</style>
