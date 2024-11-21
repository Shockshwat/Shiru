<script context='module'>
  import { derived, writable } from 'simple-store-svelte'
  import { click, hoverChange } from '@/modules/click.js'
  import { since, debounce, createListener } from '@/modules/util.js'
  import { notify, updateNotify } from '@/modules/settings.js'
  import { X, Play, MailCheck, MailOpen } from 'lucide-svelte'
  import { anilistClient } from '@/modules/anilist.js'

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
  let modal
  let mediaCache = writable({})
  const { reactive, init } = createListener(['btn'])
  function close () {
    $notifyView = false
  }
  function checkClose ({ keyCode }) {
    if (keyCode === 27) close()
  }
  $: $notifyView && modal?.focus()
  $: init($notifyView)

  anilistClient.mediaCache.subscribe((value) => {
    mediaCache.set(value)
  })

  window.addEventListener('overlay-check', () => {
    if ($notifyView) close()
  })
  window.addEventListener('notification-app', (event) => addNotification(event.detail))

  function addNotification(notification) {
    notifications.update((n) => {
      // Filter out any existing notifications with the same id, episode, and dub with either matching torrents or if existing is not a torrent.
      const filtered = n.filter((existing) => {
        if (existing.click_action === 'TORRENT' && notification.click_action !== 'TORRENT') return true
        return existing.id !== notification.id || existing.episode !== notification.episode || existing.dub !== notification.dub
      })
      // Add the new notification and sort the list
      return [notification, ...filtered].sort((a, b) => {
        const timestampDiff = b.timestamp - a.timestamp
        if (timestampDiff !== 0) return timestampDiff
        if (a.id === b.id && a.episode && b.episode) return b.episode - a.episode
        return 0
      })
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
</script>

<div class='modal z-55' class:show={$notifyView}>
  {#if $notifyView}
    <div class='modal-dialog' on:pointerup|self={close} on:keydown={checkClose} tabindex='-1' role='button' bind:this={modal}>
      <div class='modal-content mw-500 w-auto d-flex justify-content-center flex-column'>
        <div class='d-flex justify-content-end align-items-start w-auto'>
          <button type='button' class='btn btn-square text-white font-size-24 font-weight-bold' on:click={close}>
            <X size='1.7rem' strokeWidth='3'/>
          </button>
        </div>
        <div class='notification-list mt-10 overflow-y-auto mh-350'>
          {#each $notifications as notification}
            {@const announcement = notification.click_action === 'VIEW'}
            {@const notWatching = !announcement && notification.episode && ((!$mediaCache[notification?.id]?.mediaListEntry?.progress) || ($mediaCache[notification?.id]?.mediaListEntry?.progress === 0 && ($mediaCache[notification?.id]?.mediaListEntry?.status !== 'CURRENT' || $mediaCache[notification?.id]?.mediaListEntry?.status !== 'REPEATING')))}
            {@const behind = !announcement && !notWatching && notification.episode && ($mediaCache[notification?.id]?.mediaListEntry?.progress < (notification.episode - 1))}
            {@const watched = !announcement && !notWatching && !behind && notification.episode && ($mediaCache[notification?.id]?.mediaListEntry?.progress >= notification.episode)}
            {#if watched && !notification.read}
              {(notification.read = true) && ''}
            {/if}
            <div class='notification-item shadow-lg position-relative d-flex align-items-center ml-20 mr-20 mt-5 mb-5 p-5 scale pointer' role='button' tabindex='0' use:hoverChange={() => {notification.prompt = false; delete notification.prompt}} use:click={() => { if (!behind || notification.prompt) { onclick(notification); notification.prompt = false; delete notification.prompt; notification.read = true } else { notification.prompt = true } } } on:contextmenu|preventDefault={() => { onclick(notification, true); notification.read = true }} class:not-reactive={!$reactive} class:read={notification.read} class:behind={behind} class:current={!behind} class:not-watching={notWatching} class:watched={watched} class:announcement={announcement}>
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
                <p class='font-size-12 mb-0'>{notification.message}</p>
                <div class='d-flex justify-content-between align-items-center'>
                  <p class='font-size-10 text-muted mt-0 mb-0'>{since(new Date(notification.timestamp * 1000))}</p>
                  <div>
                    {#if announcement}
                      <span class='badge badge-announcement mr-5'>Announcement</span>
                    {:else}
                      <span class='badge badge-episode mr-5'>Episode {notification.episode}</span>
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
                <button type='button' class='btn btn-lg btn-secondary w-230 h-33 text-dark font-size-16 font-weight-bold shadow-none border-0 d-flex align-items-center mt-10 mb-auto' use:click={() => { onclick(notification); notification.prompt = false; delete notification.prompt; notification.read = true } }>
                  <Play class='mr-10' fill='currentColor' size='1.4rem' />
                  Continue Anyway?
                </button>
              </div>
            </div>
          {/each}
        </div>
        <div class='d-flex flex-column justify-content-between align-items-center'>
          {#if $notifications.length > 0}
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
    max-height: 35rem;
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
