<script>
  import { persisted } from 'svelte-persisted-store'
  import { client } from '@/modules/torrent.js'
  import { onDestroy } from 'svelte'
  import SettingCard from './SettingCard.svelte'
  import Debug from 'debug'

  const debug = persisted('debug', '', {
    serializer: {
      parse: e => e,
      stringify: e => e
    }
  })

  export let version = ''
  export let settings

  function updateDebug (debug) {
    Debug.disable()
    if (debug) Debug.enable(debug)
    client.send('debug', debug)
  }

  $: updateDebug($debug)

  onDestroy(() => {
    IPC.off('device-info', writeAppInfo)
  })

  function writeAppInfo (info) {
    const deviceInfo = JSON.parse(info)
    deviceInfo.appInfo = {
      version,
      platform: window.version.platform,
      userAgent: navigator.userAgent,
      support: SUPPORTS,
      settings
    }
    navigator.clipboard.writeText(JSON.stringify(deviceInfo, null, 2))
    toast.success('Copied to clipboard', {
      description: 'Copied device info to clipboard',
      duration: 5000
    })
  }

  IPC.on('device-info', writeAppInfo)
</script>

<script context='module'>
  import { click } from '@/modules/click.js'
  import { toast } from 'svelte-sonner'
  import { cache, caches } from '@/modules/cache.js'
  import IPC from '@/modules/ipc.js'
  import { SUPPORTS } from '@/modules/support.js'

  async function importSettings () {
    try {
      const settings = JSON.parse(await navigator.clipboard.readText())
      await cache.write(caches.GENERAL, 'settings', settings)
      location.reload()
    } catch (error) {
      toast.error('Failed to import settings', {
        description: 'Failed to import settings from clipboard, make sure the copied data is valid JSON.',
        duration: 5000
      })
    }
  }
  function exportSettings () {
    navigator.clipboard.writeText(JSON.stringify(cache.getEntry(caches.GENERAL, 'settings')))
    toast('Copied to clipboard', {
      description: 'Copied settings to clipboard',
      duration: 5000
    })
  }
  function checkUpdate () {
    IPC.emit('update')
  }
  setInterval(checkUpdate, 1200000)

  IPC.on('log-contents', log => {
    navigator.clipboard.writeText(log)
    toast.success('Copied to clipboard', {
      description: 'Copied log contents to clipboard',
      duration: 5000
    })
  })
</script>

<h4 class='mb-10 font-weight-bold'>Debug Settings</h4>
<SettingCard title='Logging Levels' description='Enable logging of specific parts of the app. These logs are saved to %appdata$/Shiru/logs/main.log or ~/config/Shiru/logs/main.log.'>
  <select class='form-control bg-dark w-300 mw-full' bind:value={$debug}>
    <option value='' selected>None</option>
    <option value='*'>All</option>
    <option value='torrent:*,webtorrent:*,simple-peer,bittorrent-protocol,bittorrent-dht,bittorrent-lsd,torrent-discovery,bittorrent-tracker:*,ut_metadata,nat-pmp,nat-api'>Torrent</option>
    <option value='ui:*'>Interface</option>
  </select>
</SettingCard>

<SettingCard title='Toast Levels' description='Changes what toasts are shown in the app, limiting what toasts are shown could be useful if an api is down to prevent spam.'>
  <select class='form-control bg-dark w-300 mw-full' bind:value={settings.toasts}>
    <option value='All' selected>All</option>
    <option value='Warnings / Successes'>Warnings / Successes</option>
    <option value='Errors'>Errors</option>
    <option value='None'>None</option>
  </select>
</SettingCard>

<SettingCard title='App and Device Info' description='Copy app and device debug info and capabilities, such as GPU information, GPU capabilities, version information and settings to clipboard.'>
  <button type='button' use:click={() => IPC.emit('get-device-info')} class='btn btn-primary d-flex align-items-center justify-content-center'><span>Copy To Clipboard</span></button>
</SettingCard>

{#if !SUPPORTS.isAndroid}
  <SettingCard title='Log Output' description='Copy debug logs to clipboard. Once you enable a logging level you can use this to quickly copy the created logs to clipboard instead of navigating to the log file in directories.'>
    <button type='button' use:click={() => IPC.emit('get-log-contents')} class='btn btn-primary d-flex align-items-center justify-content-center'><span>Copy To Clipboard</span></button>
  </SettingCard>

  <SettingCard title='Open Torrent Devtools' description="Open devtools for the detached torrent process, this allows to inspect code execution and memory. DO NOT PASTE ANY CODE IN THERE, YOU'RE LIKELY BEING SCAMMED IF SOMEONE TELLS YOU TO!">
    <button type='button' use:click={() => IPC.emit('torrent-devtools')} class='btn btn-primary d-flex align-items-center justify-content-center'><span>Open Devtools</span></button>
  </SettingCard>

  <SettingCard title='Open UI Devtools' description="Open devtools for the UI process, this allows to inspect media playback information, rendering performance and more. DO NOT PASTE ANY CODE IN THERE, YOU'RE LIKELY BEING SCAMMED IF SOMEONE TELLS YOU TO!">
    <button type='button' use:click={() => IPC.emit('ui-devtools')} class='btn btn-primary d-flex align-items-center justify-content-center'><span>Open Devtools</span></button>
  </SettingCard>
{/if}
<SettingCard title='Reset Notifications' description='Resets all notifications that have been cached, this is not recommended unless you are experiencing issues. This will also reset the last time you have been notified, so expect previous notifications to appear again.'>
  <button type='button' use:click={() => cache.resetNotifications()} class='btn btn-primary d-flex align-items-center justify-content-center'><span>Reset Notifications</span></button>
</SettingCard>
<SettingCard title='Reset History' description='Resets all history data that has been cached, this is not recommended unless you are experiencing issues. You will lose your local episode progress and magnet links history.'>
  <button type='button' use:click={() => cache.resetHistory()} class='btn btn-primary d-flex align-items-center justify-content-center'><span>Reset History</span></button>
</SettingCard>
<SettingCard title='Reset Caches' description='Resets everything the app has cached, this is not recommended unless you are experiencing issues. Caching increases load times and decreases down time. This does not reset the notifications or history cache. THIS WILL FORCE RESTART THE APP!'>
  <button type='button' use:click={() => cache.resetCaches()} class='btn btn-primary d-flex align-items-center justify-content-center'><span>Reset Caches</span></button>
</SettingCard>

<h4 class='mb-10 font-weight-bold'>App Settings</h4>
<SettingCard title='Close Action' description='Choose the functionality of the close button for the app. You can choose to receive a Prompt to Minimize or Close, default to Minimize, or default to Closing the app.'>
  <div>
    <select class='form-control bg-dark w-300 mw-full' bind:value={settings.closeAction}>
      <option value='Prompt'>Prompt</option>
      <option value='Minimize'>Minimize</option>
      <option value='Close'>Close</option>
    </select>
  </div>
</SettingCard>

<SettingCard title='Query Complexity' description="Complex queries result in slower loading times but help in reducing the chances of hitting AniList's rate limit. Simple queries split up the requests into multiple queries which are requested as needed.">
  <div>
    <select class='form-control bg-dark w-300 mw-full' bind:value={settings.queryComplexity}>
      <option value='Complex'>Complex (slow)</option>
      <option value='Simple'>Simple (fast)</option>
    </select>
  </div>
</SettingCard>

<div class='d-inline-flex flex-column'>
  <button use:click={importSettings} class='btn btn-primary mt-10 d-flex align-items-center justify-content-center' type='button'><span>Import Settings From Clipboard</span></button>
  <button use:click={exportSettings} class='btn btn-primary mt-10 d-flex align-items-center justify-content-center' type='button'><span>Export Settings To Clipboard</span></button>
  {#if SUPPORTS.update}
    <button use:click={checkUpdate} class='btn btn-primary mt-10 d-flex align-items-center justify-content-center' type='button'><span>Check For Updates</span></button>
  {/if}
  <button use:click={() => cache.resetSettings()} class='btn btn-danger mt-10 d-flex align-items-center justify-content-center' type='button' data-toggle='tooltip' data-placement='top' data-title='Restores All Settings Back To Their Recommended Defaults'><span>Restore Default Settings</span></button>
</div>
