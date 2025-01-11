<script context='module'>
  import { derived, writable } from 'simple-store-svelte'
  import { click, hoverExit } from '@/modules/click.js'
  import { createListener, debounce, since } from '@/modules/util.js'
  import { notify, updateNotify } from '@/modules/settings.js'
  import { MailCheck, MailOpen, Play, X } from 'lucide-svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import smoothScroll from '@/modules/scroll.js'

  export const notifyView = writable(false)
  export const notifications = writable(notify.value.notifications || [])
  export const hasUnreadNotifications = derived(notifications, _notifications => _notifications?.filter(notification => notification.read !== true)?.length > 0)

  let debounceNotify = false
  const debounceBatch = debounce(() => {
    if (debounceNotify) {
      updateNotify('notifications', notifications.value)
      debounceNotify = false
    }
  }, 4500)
  notifications.subscribe(() => {
    debounceNotify = true
    debounceBatch()
  })
</script>
<script>
  export let overlay

  let modal
  let mediaCache = writable({})
  const { reactive, init } = createListener(['btn'])
  function close () {
    $notifyView = false
    overlay = overlay.filter(item => item !== 'notifications')
    updateSort()
  }
  function checkClose ({ keyCode }) {
    if (keyCode === 27) close()
  }
  $: $notifyView && (modal?.focus(), overlay = [...overlay, 'notifications'])
  $: !$notifyView && close()
  $: init($notifyView)
  $: {
    if (!$notifyView) updateSort()
    else currentNotifications = $notifications.slice(0, notificationCount)
  }

  anilistClient.mediaCache.subscribe((value) => {
    mediaCache.set(value)
  })

  window.addEventListener('overlay-check', () => { if ($notifyView) close() })
  window.addEventListener('notification-app', (event) => addNotification(event.detail))
  window.addEventListener('notification-reset', () => notifications.set([]))

  function addNotification(notification) {
    notifications.update((n) => {
      const filterDelayed = n.filter((existing) => { // Remove existing notifications based on delayed status and conditions
        if (notification.delayed) return !(existing.id === notification.id && existing.episode === notification.episode && existing.dub === true && existing.click_action === 'PLAY') // If the new notification is delayed, remove all matching notifications
        else return !(existing.id === notification.id && existing.episode === notification.episode && existing.delayed === true) // If the new notification is not delayed, remove any existing delayed notifications
      })

      if (filterDelayed.findIndex((existing) => existing.id === notification.id && ((existing.episode === notification.episode && !(existing.season !== notification.season)) || (existing.format === 'MOVIE' && notification.format === 'MOVIE')) && existing.dub === notification.dub && (existing.click_action === 'TORRENT')) !== -1) return filterDelayed
      const filtered = filterDelayed.filter((existing) => (existing.id !== notification.id || existing.episode !== notification.episode || existing.dub !== notification.dub || existing.click_action === 'TORRENT'))
      if (notification.episode && (mediaCache[notification?.id]?.mediaListEntry?.status === 'COMPLETED' || (mediaCache[notification?.id]?.mediaListEntry?.progress >= (!notification.season ? notification.episode : mediaCache[notification?.id].episodes)))) notification.read = true
      return sort([notification, ...filtered])
    })
  }

  function sort(array) {
    return array.sort((a, b) => {
      const timestampDiff = b.timestamp - a.timestamp
      if (timestampDiff !== 0) return timestampDiff
      if (a.id === b.id && a.episode && b.episode && !a.season && !b.season) return b.episode - a.episode
      return 0
    }).sort((a, b) => {
      if (!a.read && b.read) return -1
      if (a.read && !b.read) return 1
      return 0
    })
  }

  function markAll(read) {
    notifications.update(items => items.map(notification => ({ ...notification, read: read })))
  }

  function onclick(notification, view) {
    close()
    if (notification.click_action === 'VIEW' || view) {
      window.dispatchEvent(new CustomEvent('open-anime', { detail: { id: notification.id } }))
    } else if (notification.click_action === 'PLAY') {
      window.dispatchEvent(new CustomEvent('play-anime', {
        detail: {
          id: notification.id,
          episode: notification.episode,
          torrentOnly: true
        }
      }))
    } else if (notification.click_action === 'TORRENT') {
      window.dispatchEvent(new CustomEvent('play-torrent', { detail: { magnet: notification.magnet } }))
    }
  }

  function updateSort() {
    notifications.update(currentNotifications => sort([...currentNotifications]))
    return true
  }

  let notificationCount = 25
  let currentNotifications = []
  function handleScroll(event) {
    const container = event.target
    if (currentNotifications.length !== $notifications.length && container.scrollTop + container.clientHeight + 10 >= container.scrollHeight) {
      const nextBatch = $notifications.slice(currentNotifications.length, currentNotifications.length + notificationCount)
      currentNotifications = [...new Set([...currentNotifications, ...nextBatch])]
    }
  }
</script>

<div class='modal z-55' class:show={$notifyView}>
  {#if $notifyView}
    <div class='modal-dialog overflow-x-hidden' on:pointerup|self={close} on:keydown={checkClose} tabindex='-1' role='button' bind:this={modal}>
      <div class='modal-content w-auto bg-transparent d-flex justify-content-center align-items-center pt-20 pb-20' class:h-full={currentNotifications.length > 0}>
        <div class='modal-content mw-500 w-auto d-flex justify-content-center flex-column' class:h-full={currentNotifications.length > 0}>
          <div class='d-flex justify-content-end align-items-start w-auto'>
            <button type='button' class='btn btn-square d-flex align-items-center justify-content-center' use:click={close}><X size='1.7rem' strokeWidth='3'/></button>
          </div>
          <div class='notification-list mt-10 overflow-y-auto h-auto' class:mh-350={currentNotifications.length > 0} use:smoothScroll on:scroll={handleScroll}>
            {#each currentNotifications as notification, index}
              {@const delayed = notification.delayed }
              {@const announcement = notification.click_action === 'VIEW' && !delayed}
              {@const notWatching = !announcement && !delayed && notification.episode && ((!$mediaCache[notification?.id]?.mediaListEntry?.progress) || ($mediaCache[notification?.id]?.mediaListEntry?.progress === 0 && ($mediaCache[notification?.id]?.mediaListEntry?.status !== 'CURRENT' || $mediaCache[notification?.id]?.mediaListEntry?.status !== 'REPEATING' && $mediaCache[notification?.id]?.mediaListEntry?.status !== 'COMPLETED')))}
              {@const behind = !announcement && !delayed && !notWatching && notification.episode && (mediaCache[notification?.id]?.mediaListEntry?.status !== 'COMPLETED' && ($mediaCache[notification?.id]?.mediaListEntry?.progress < ((!notification.season ? notification.episode : $mediaCache[notification?.id].episodes) - 1)))}
              {@const watched = !announcement && !delayed && !notWatching && !behind && notification.episode && ($mediaCache[notification?.id]?.mediaListEntry?.status === 'COMPLETED' || ($mediaCache[notification?.id]?.mediaListEntry?.progress >= (!notification.season ? notification.episode : $mediaCache[notification?.id].episodes)))}
              {#if watched && !notification.read}
                {(notification.read = true) && updateSort() && ''}
              {/if}
              <div class='notification-item shadow-lg position-relative d-flex align-items-center ml-20 mr-20 mt-5 mb-5 p-5 scale pointer' role='button' tabindex='0' use:hoverExit={() => {notification.prompt = false; delete notification.prompt}} use:click={() => { if (!behind || notification.prompt) { notification.prompt = false; delete notification.prompt; notification.read = true; onclick(notification) } else { notification.prompt = true } } } on:contextmenu|preventDefault={() => { notification.read = true; onclick(notification, true); }} class:not-reactive={!$reactive} class:read={notification.read} class:behind={behind || delayed} class:current={!behind} class:not-watching={notWatching} class:watched={watched} class:announcement={announcement}>
                {#if notification.heroImg}
                  <div class='position-absolute top-0 left-0 w-full h-full'>
                    <img src={notification.heroImg} alt='bannerImage' class='hero-img w-full h-full'/>
                    <div class='position-absolute top-0 left-0 w-full h-full' style='border-radius: .5rem; background: var(--notification-card-gradient)' />
                  </div>
                {/if}
                <div class='notification-icon-container d-flex justify-content-center align-items-center overflow-hidden mr-10 z-10'>
                  <img src={notification.icon} alt='icon' class='notification-icon w-auto' />
                </div>
                <div class='notification-content z-10 w-full'>
                  <p class='notification-title overflow-hidden font-size-18 font-weight-bold mt-0 mb-0 mr-40'>{notification.title}</p>
                  <button type='button' class='position-absolute right-0 top-0 mr-5 mt-5 btn btn-square d-flex align-items-center justify-content-center' class:not-allowed={watched} class:not-reactive={watched} use:click={() => { if (!watched) notification.prompt = false; delete notification.prompt; notification.read = !notification.read } }>
                    {#if notification.read}
                      <MailOpen size='1.7rem' strokeWidth='3'/>
                    {:else}
                      <MailCheck size='1.7rem' strokeWidth='3'/>
                    {/if}
                  </button>
                  <p class='font-size-12 mb-0 mr-5'>{notification.message}</p>
                  <div class='d-flex justify-content-between align-items-center'>
                    <p class='font-size-10 text-muted mt-0 mb-0'>{since(new Date(notification.timestamp * 1000))}</p>
                    <div>
                      {#if announcement}
                        <span class='badge badge-announcement mr-5'>Announcement</span>
                      {:else if notification.format === 'MOVIE'}
                        <span class='badge badge-episode mr-5'>Movie</span>
                      {:else if !notification.season}
                        {#if delayed}<span class='badge badge-delayed mr-5'>Delayed</span>{/if}
                        <span class='badge badge-episode mr-5'>{notification.episode ? `Episode ${notification.episode}` : `Batch`} </span>
                      {:else if notification.season}
                      <span class='badge badge-episode mr-5'>Season {notification.episode}</span>
                      {/if}
                      {#if notification.dub}
                        <span class='badge badge-dub'>Dub</span>
                      {:else}
                        <span class='badge badge-sub'>Sub</span>
                      {/if}
                    </div>
                  </div>
                </div>
                <div class='overlay position-absolute w-full h-full z-40 d-flex flex-column align-items-center' class:visible={notification.prompt} class:invisible={!notification.prompt}>
                  <p class='ml-20 mr-20 font-size-20 text-white text-center mt-auto mb-0'>Your Current Progress Is At <b>Episode {$mediaCache[notification?.id]?.mediaListEntry?.progress}</b></p>
                  <button type='button' class='btn btn-lg btn-secondary w-230 h-33 text-dark font-size-16 font-weight-bold shadow-none border-0 d-flex align-items-center mt-10 mb-auto' use:click={() => { notification.prompt = false; delete notification.prompt; notification.read = true; onclick(notification) } }>
                    <Play class='mr-10' fill='currentColor' size='1.4rem' />
                    Continue Anyway?
                  </button>
                </div>
              </div>
            {/each}
          </div>
          <div class='d-flex flex-column justify-content-between align-items-center'>
            {#if currentNotifications.length > 0}
              <button type='button' class='btn text-light font-weight-bold shadow-none border-0 d-flex align-items-center mt-20' on:click={() => markAll($hasUnreadNotifications)}>
                {#if $hasUnreadNotifications}
                  <MailCheck strokeWidth='3' class='mr-10' size='1.7rem' />
                  Mark All As Read
                {:else}
                  <MailOpen strokeWidth='3' class='mr-10' size='1.7rem' />
                  Mark All As Unread
                {/if}
              </button>
            {:else}
              <div class='d-flex flex-column justify-content-between align-items-center mb-20'>
                <p class='font-size-20 mb-0'>Nothing To See Here!</p>
                <p class='font-size-16'>Settings > Interface > Notifications Settings</p>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .z-55 {
    z-index: 55;
  }
  .h-33 {
    height: 3.3rem !important;
  }
  .mr-40 {
    margin-right: 4rem;
  }
  .mw-500 {
    min-width: 50rem;
    max-width: 80rem;
  }
  .mh-350 {
    min-height: 35rem;
  }
  .scale {
    transition: transform 0.2s ease;
  }
  .scale:hover{
    transform: scale(1.04);
  }
  .font-size-10 {
    font-size: 1rem;
  }
  .not-allowed {
    cursor: not-allowed !important;
  }

  .badge-sub {
    color: #000000 !important;
    border-color: rgb(154, 72, 255) !important;
    background-color: rgb(154, 72, 255) !important;
  }
  .badge-dub {
    color: #000000 !important;
    border-color: rgb(255, 214, 0) !important;
    background-color: rgb(255, 214, 0) !important;
  }
  .badge-episode {
    color: #000000 !important;
    border-color: #CCCCFF !important;
    background-color: #CCCCFF !important;
  }
  .badge-announcement {
    color: #000000 !important;
    border-color: #FFFFF0 !important;
    background-color: #FFFFF0 !important;
  }
  .badge-delayed {
    color: #000000 !important;
    border-color: #bc2023 !important;
    background-color: #bc2023 !important;
  }

  .notification-item {
    background-color: rgb(26, 28, 32);
    border-radius: .75rem;
  }
  .notification-item.read {
    opacity: .5;
  }
  .notification-item.current {
    border-left: .4rem solid rgb(61,180,242);
  }
  .notification-item.watched {
    border-left: .4rem solid rgb(123,213,85);
  }
  .notification-item.behind {
    border-left: .4rem solid rgb(250,122,122);
  }
  .notification-item.announcement {
    border-left: .4rem solid #FFFFF0;
  }
  .notification-item.not-watching {
    border-left: .4rem solid #494747;
  }

  .notification-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
    word-wrap: break-word;
  }

  .hero-img {
    border-radius: .75rem;
  }
  .notification-icon {
    height: 100%;
    object-fit: cover;
    border-radius: .5rem;
    object-position: center;
  }
  .notification-icon-container {
    width: 6rem;
    height: 8rem;
    border-radius: .5rem;
  }

  .overlay {
    margin-left: -.9rem !important;
    width: 100.6% !important;
    border-radius: .62rem;
    background-color: rgba(0, 0, 0, 0.8) !important;
  }
</style>
