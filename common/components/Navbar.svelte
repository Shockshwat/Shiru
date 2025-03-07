<script>
  import { getContext } from 'svelte'
  import { rss } from '@/views/TorrentSearch/TorrentModal.svelte'
  import { nowPlaying as media } from '@/views/Player/MediaHandler.svelte'
  import { profileView } from './Profiles.svelte'
  import { notifyView, hasUnreadNotifications } from './Notifications.svelte'
  import { actionPrompt } from './MinimizeTray.svelte'
  import { SUPPORTS } from '@/modules/support.js'
  import NavbarLink from './NavbarLink.svelte'
  import { MagnifyingGlass } from 'svelte-radix'
  import { onDestroy, onMount } from 'svelte'
  import { Home, Users, Clock, Settings, Bell, BellDot, ListVideo, TvMinimalPlay } from 'lucide-svelte'
  const view = getContext('view')
  export let page
  export let playPage
  onMount(() => {
    if (SUPPORTS.isAndroid) {
      window.Capacitor.Plugins.App.addListener('backButton', () => {
        if (!($profileView || $notifyView || $actionPrompt || $rss)) window.history.back()
        else {
          $profileView = false
          $notifyView = false
          $actionPrompt = false
          $rss = null
        }
      })
    }
  })
  onDestroy(() => {
    if (SUPPORTS.isAndroid) window.Capacitor.Plugins.App.removeAllListeners()
  })
</script>

<nav class='navbar navbar-fixed-bottom d-block d-md-none border-0 bg-dark bt-10'>
  <div class='navbar-menu h-full d-flex flex-row justify-content-center align-items-center m-0 pb-5 animate'>
    <NavbarLink click={() => { page = 'home'; if ($view) $view = null }} _page='home' text='Home' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Home size='3.4rem' class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
    </NavbarLink>
    <NavbarLink click={() => { page = 'search'; if ($view) $view = null }} _page='search' icon='search' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <MagnifyingGlass size='3.4rem' class='flex-shrink-0 m-5 rounded' stroke-width='0.5' stroke='currentColor' style='padding: 0.3rem !important; color: {page===`search` && !($view || $profileView || $notifyView || $actionPrompt || $rss) ? `currentColor`:`#5e6061`}' />
    </NavbarLink>
    <NavbarLink click={() => { page = 'schedule' }} _page='schedule' icon='schedule' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Clock size='3.4rem' class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
    </NavbarLink>
    {#if $media?.media}
      {@const currentMedia = $view}
      {@const active = $view && !$notifyView && !$profileView && !$actionPrompt && 'active'}
      {@const wasOverlay = ($view || $profileView || $notifyView || $actionPrompt || $rss)}
      <NavbarLink click={() => {
        if (playPage && (page === 'player') && !wasOverlay) {
          playPage = false
        } else if (playPage) {
          page = 'player'
        } else {
          $view = (currentMedia?.id === $media?.media.id && active ? null : $media?.media)
        }
      }} rbClick={() => { $view = (currentMedia?.id === $media?.media.id && active ? null : $media?.media) }} _page={playPage ? 'player' : ''} icon='queue_music' {page} overlay={active} nowPlaying={!playPage && ($view?.id === $media?.media?.id)} let:active>
        <svelte:component this={playPage ? TvMinimalPlay : ListVideo} size='3.4rem' class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
      </NavbarLink>
    {/if}
    <NavbarLink click={() => { page = 'watchtogether' }} _page='watchtogether' icon='groups' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Users size='3.4rem' class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
    </NavbarLink>
    <NavbarLink click={() => { $notifyView = !$notifyView }} icon='bell' {page} overlay={$notifyView && 'notify'} nowPlaying={$view} let:active>
      {#if $hasUnreadNotifications &&  $hasUnreadNotifications > 0}
        <BellDot size='3.4rem' class='flex-shrink-0 p-5 m-5 rounded notify' strokeWidth='2.5' color={$notifyView ? 'white' : 'currentColor'} />
      {:else}
        <Bell size='3.4rem' class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={$notifyView ? 'currentColor' : '#5e6061'}/>
      {/if}
    </NavbarLink>
    <NavbarLink click={() => { page = 'settings' }} _page='settings' icon='settings' {page} overlay={($view || $profileView || $notifyView || $actionPrompt || $rss) && 'active'} let:active>
      <Settings size='3.4rem' class='flex-shrink-0 p-5 m-5 rounded' strokeWidth='2.5' color={active ? 'currentColor' : '#5e6061'} />
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
  .bt-10 {
    border-top: .10rem rgba(182, 182, 182, 0.13) solid !important;
  }
</style>
