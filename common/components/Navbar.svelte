<script>
  import { getContext } from 'svelte'
  import { rss } from '@/views/TorrentSearch/TorrentModal.svelte'
  import { nowPlaying as media } from '@/views/Player/MediaHandler.svelte'
  import { profileView } from './Profiles.svelte'
  import { notifyView, hasUnreadNotifications } from './Notifications.svelte'
  import { actionPrompt } from './MinimizeTray.svelte'
  import { settings } from '@/modules/settings.js'
  import { click } from '@/modules/click.js'
  import IPC from '@/modules/ipc.js'
  import NavbarLink from './NavbarLink.svelte'
  import { MagnifyingGlass } from 'svelte-radix'
  import { Users, Clock, Settings, Heart, Bell, BellDot, ListVideo } from 'lucide-svelte'
  const view = getContext('view')
  export let page
  function close () {
    $view = null
    window.dispatchEvent(new Event('overlay-check'))
    page = 'home'
  }
</script>

<nav class='navbar navbar-fixed-bottom d-block d-md-none border-0 bg-dark'>
  <div class='navbar-menu h-full d-flex flex-row justify-content-center align-items-center m-0 pb-5 animate'>
    <img src='./logo_filled.png' class='w-50 h-50 m-10 pointer p-5' alt='ico' use:click={close} />
    <NavbarLink click={() => { page = 'search'; if ($view) $view = null }} _page='search' css='ml-auto' icon='search' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <MagnifyingGlass size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' stroke-width={active ? '1' : '0'} stroke='currentColor' />
    </NavbarLink>
    <NavbarLink click={() => { page = 'schedule' }} _page='schedule' icon='schedule' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Clock size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
    </NavbarLink>
    {#if $media?.media}
      {@const currentMedia = $view}
      {@const active = $view && !$notifyView && !$profileView && !$actionPrompt && 'active'}
      <NavbarLink click={() => { $view = (currentMedia?.id === $media?.media.id && active ? null : $media?.media) }} icon='queue_music' {page} overlay={active} nowPlaying={$view === $media?.media} let:active>
        <ListVideo size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
      </NavbarLink>
    {/if}
    <NavbarLink click={() => { page = 'watchtogether' }} _page='watchtogether' icon='groups' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Users size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
    </NavbarLink>
    {#if $settings.donate}
      <NavbarLink click={() => { IPC.emit('open', 'https://github.com/sponsors/RockinChaos/') }} icon='favorite' css='ml-auto donate' {page} let:active>
        <Heart size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded donate' strokeWidth={active ? '3' : '2'} fill='currentColor' />
      </NavbarLink>
    {/if}
    <NavbarLink click={() => { $notifyView = !$notifyView }} icon='bell' css='{!$settings.donate ? `ml-auto donate` : ``}' {page} overlay={$notifyView && 'notify'} nowPlaying={$view === $media?.media} let:active>
      {#if $hasUnreadNotifications}
        <BellDot size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded notify' strokeWidth={active ? '3' : '2'} />
      {:else}
        <Bell size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
      {/if}
    </NavbarLink>
    <NavbarLink click={() => { page = 'settings' }} _page='settings' icon='settings' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Settings size='2rem' class='flex-shrink-0 p-5 w-30 h-30 m-5 rounded' strokeWidth={active ? '3' : '2'} />
    </NavbarLink>
  </div>
</nav>

<style>
  .navbar .animate :global(.donate) {
    animation: pink_glow 1s ease-in-out infinite alternate;
  }
  .navbar .animate :global(.notify) {
    animation: purple_glow 1s ease-in-out infinite alternate, bell_shake 10s infinite;
  }
  .navbar :global(.donate):active {
    color: #fa68b6 !important;
  }
  .navbar :global(.donate) {
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
  .navbar :global(.notify):active {
    color: #af68fa !important;
  }
  .navbar :global(.notify) {
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
</style>
