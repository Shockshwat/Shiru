<script>
  import { variables } from '@/modules/themes.js'
  import { click } from '@/modules/click.js'
  import HomeSections from './HomeSectionsSettings.svelte'
  import IPC from '@/modules/ipc.js'
  import SettingCard from './SettingCard.svelte'
  import { SUPPORTS } from '@/modules/support.js'
  import { Trash2 } from 'lucide-svelte'
  import AudioLabel from '@/views/ViewAnime/AudioLabel.svelte'
  import Helper from "@/modules/helper.js"
  function updateAngle () {
    IPC.emit('angle', settings.value.angle)
  }
  export let settings
</script>

{#if SUPPORTS.discord}
  <h4 class='mb-10 font-weight-bold'>Rich Presence Settings</h4>
  <SettingCard title='Discord Rich Presence' description='Enables the use of Discord rich presence to display app activity.'>
    <div class='custom-switch'>
      <input type='checkbox' id='rpc-enabled' bind:checked={settings.enableRPC} />
      <label for='rpc-enabled'>{settings.enableRPC ? 'On' : 'Off'}</label>
    </div>
  </SettingCard>
  {#if settings.enableRPC}
    <SettingCard title='Show Details in Discord Rich Presence' description='Shows currently played anime and episode in Discord rich presence.'>
      <div class='custom-switch'>
        <input type='checkbox' id='rpc-details' bind:checked={settings.showDetailsInRPC} />
        <label for='rpc-details'>{settings.showDetailsInRPC ? 'On' : 'Off'}</label>
      </div>
    </SettingCard>
  {/if}
{/if}

<h4 class='mb-10 font-weight-bold'>Interface Settings</h4>
<SettingCard title='Enable Donate Button' description='Enables the "Support This App" button on the menu bar.'>
  <div class='custom-switch'>
    <input type='checkbox' id='donate' bind:checked={settings.donate} />
    <label for='donate'>{settings.donate ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
<SettingCard title='Enable Smooth Scrolling' description='Enables smooth scrolling for vertical containers. Turning this off might remove jitter when scrolling on devices without a GPU.'>
  <div class='custom-switch'>
    <input type='checkbox' id='smooth-scroll' bind:checked={settings.smoothScroll} />
    <label for='smooth-scroll'>{settings.smoothScroll ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
<SettingCard title='Enable Sidebar Animation' description='Enables the sidebar expand hover animation.'>
  <div class='custom-switch'>
    <input type='checkbox' id='disable-sidebar' bind:checked={settings.expandingSidebar} />
    <label for='disable-sidebar'>{settings.expandingSidebar ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
<SettingCard title='CSS Variables' description='Used for custom themes. Can change colors, sizes, spacing and more. Supports only variables. Best way to discover variables is to use the built-in devtools via Ctrl+Shift+I or F12.'>
  <textarea class='form-control w-500 mw-full bg-dark' placeholder='--accent-color: #e5204c;' bind:value={$variables} />
</SettingCard>
{#if !Helper.isAniAuth()}
  <SettingCard title='Preferred Title Language' description='What title language to automatically select when displaying the title of an anime.'>
    <select class='form-control bg-dark w-300 mw-full' bind:value={settings.titleLang}>
      <option value='romaji' selected>Japanese</option>
      <option value='english'>English</option>
    </select>
  </SettingCard>
{/if}
<SettingCard title='Card Type' description='What type of cards to display in menus.'>
  <select class='form-control bg-dark w-300 mw-full' bind:value={settings.cards}>
    <option value='small' selected>Small</option>
    <option value='full'>Full</option>
  </select>
</SettingCard>
<SettingCard title='Card Audio' description={'If the dub or sub icon should be shown on the cards in the menu, will be hidden on the schedule page.\nThis will show one of three simple icons which are previewed as follows:'}>
  <AudioLabel example={true}/>
  <div class='custom-switch'>
    <input type='checkbox' id='card-audio' bind:checked={settings.cardAudio} />
    <label for='card-audio'>{settings.cardAudio ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{#if SUPPORTS.angle}
  <h4 class='mb-10 font-weight-bold'>Rendering Settings</h4>
  <SettingCard title='ANGLE Backend' description="What ANGLE backend to use for rendering. DON'T CHANGE WITHOUT REASON! On some Windows machines D3D9 might help with flicker. Changing this setting to something your device doesn't support might prevent Shiru from opening which will require a full reinstall. While Vulkan is an available option it might not be fully supported on Linux.">
    <select class='form-control bg-dark w-300 mw-full' bind:value={settings.angle} on:change={updateAngle}>
      <option value='default' selected>Default</option>
      <option value='d3d9'>D3D9</option>
      <option value='d3d11'>D3D11</option>
      <option value='warp'>Warp [Software D3D11]</option>
      <option value='gl'>GL</option>
      <option value='gles'>GLES</option>
      <option value='swiftshader'>SwiftShader</option>
      <option value='vulkan'>Vulkan</option>
      <option value='metal'>Metal</option>
    </select>
  </SettingCard>
{/if}
<h4 class='mb-10 font-weight-bold'>Notification Settings</h4>
<SettingCard title='System Notifications' description='Allows custom system notifications to be sent, with this disabled you will still get in-app notifications.'>
  <div class='custom-switch'>
    <input type='checkbox' id='system-notify' bind:checked={settings.systemNotify} />
    <label for='system-notify'>{settings.systemNotify ? 'On' : 'Off'}</label>
  </div>
</SettingCard>
{#if Helper.isAniAuth()}
  <SettingCard title='AniList Notifications' description='Get notifications from your AniList account, showing when episodes have aired and any new anime titles you are following have been added to the database. Limited will only get important notifications like when a new season is announced, consider using the Limited setting when using RSS Feed notifications.'>
    <select class='form-control bg-dark w-300 mw-full' bind:value={settings.aniNotify}>
      <option value='all' selected>All</option>
      <option value='limited'>Limited</option>
      <option value='none'>None</option>
    </select>
  </SettingCard>
{/if}
<SettingCard title='Dubs Notifications' description={'When the dub schedule airs a new episode or any new anime titles you are following have been added to the database, a notification will be sent depending on your list status.\n\nLimited will only get important notifications like when a dub for a new season is announced, consider using the Limited setting when using RSS Feed notifications.'}>
  <div>
    {#each settings.dubNotify as status, i}
      <div class='input-group mb-10 w-500 mw-full'>
        <select id='dubs-notify-{i}' class='w-400 form-control mw-full bg-dark' bind:value={settings.dubNotify[i]} >
          <option disabled value=''>Select a status</option>
          {#each [['Watching', 'CURRENT'], ['Planning', 'PLANNING'], ['Paused', 'PAUSED'], ['Completed', 'COMPLETED'], ['Dropped', 'DROPPED'], ['Rewatching', 'REPEATING'], ['Not on List', 'NOTONLIST']].filter(option => !settings.dubNotify.includes(option)) as option}
            <option value='{option[1]}'>{option[0]}</option>
          {/each}
        </select>
        <div class='input-group-append'>
          <button type='button' use:click={() => { settings.dubNotify.splice(i, 1); settings.dubNotify = settings.dubNotify }} class='btn btn-danger btn-square input-group-append px-5 d-flex align-items-center'><Trash2 size='1.8rem' /></button>
        </div>
      </div>
    {/each}
    <div class='d-flex'>
      <button type='button' use:click={() => { settings.dubNotify = [...settings.dubNotify, ''] }} class='btn btn-primary mb-10'>Add Status</button>
      <div class='custom-switch ml-auto mt-7'>
        <input type='checkbox' id='dubs-limited' bind:checked={settings.dubNotifyLimited} />
        <label for='dubs-limited'>Limited</label>
      </div>
    </div>
  </div>
</SettingCard>
<SettingCard title='RSS Feed' description={'When each RSS feed updates with new entries, notifications will be sent depending on your list status.\n\nDub Preferred will send notifications for an anime only if a dubbed episode is available or if the series is sub-only (no dub exists). This is ideal for viewers who prioritize watching dubbed content whenever possible.'}>
  <div>
    {#each settings.rssNotify as status, i}
      <div class='input-group mb-10 w-500 mw-full'>
        <select id='rss-feed-{i}' class='w-400 form-control mw-full bg-dark' bind:value={settings.rssNotify[i]} >
          <option disabled value=''>Select a status</option>
          {#each [['Watching', 'CURRENT'], ['Planning', 'PLANNING'], ['Paused', 'PAUSED'], ['Completed', 'COMPLETED'], ['Dropped', 'DROPPED'], ['Rewatching', 'REPEATING'], ['Not on List', 'NOTONLIST']].filter(option => !settings.rssNotify.includes(option)) as option}
            <option value='{option[1]}'>{option[0]}</option>
          {/each}
        </select>
        <div class='input-group-append'>
          <button type='button' use:click={() => { settings.rssNotify.splice(i, 1); settings.rssNotify = settings.rssNotify }} class='btn btn-danger btn-square input-group-append px-5 d-flex align-items-center'><Trash2 size='1.8rem' /></button>
        </div>
      </div>
    {/each}
    <div class='d-flex'>
      <button type='button' use:click={() => { settings.rssNotify = [...settings.rssNotify, ''] }} class='btn btn-primary mb-10'>Add Status</button>
      <div class='custom-switch  ml-auto mt-7'>
        <input type='checkbox' id='rss-feed-dubs' bind:checked={settings.rssNotifyDubs} />
        <label for='rss-feed-dubs'>Dub Preferred</label>
      </div>
    </div>
  </div>
</SettingCard>

<h4 class='mb-10 font-weight-bold'>Home Screen Settings</h4>
{#if Helper.isAuthorized()}
  <SettingCard title='Hide My Anime' description={'The anime on your Watching, Rewatching, Completed, and Dropped list will automatically be hidden from the default sections, this excludes manually added RSS feeds and user specific feeds.'}>
    <div class='custom-switch'>
      <input type='checkbox' id='hide-my-anime' bind:checked={settings.hideMyAnime} />
      <label for='hide-my-anime'>{settings.hideMyAnime ? 'On' : 'Off'}</label>
    </div>
  </SettingCard>
{/if}
<SettingCard title='RSS Feeds' description={'RSS feeds to display on the home screen. This needs to be a CORS enabled URL to a Nyaa or Tosho like RSS feed which cotains either an "infoHash" or "enclosure" tag.\nThis only shows the releases on the home screen, it doesn\'t automatically download the content.\nSince the feeds only provide the name of the file, Shiru might not always detect the anime correctly!\nSome presets for popular groups are already provided as an example, custom feeds require the FULL URL.'}>
  <div>
    {#each settings.rssFeedsNew as _, i}
      <div class='input-group mb-10 w-500 mw-full'>
        <input type='text' class='form-control w-150 mw-full bg-dark flex-reset' placeholder='New Releases' autocomplete='off' bind:value={settings.rssFeedsNew[i][0]} />
        <input id='rss-feed-{i}' type='text' list='rss-feed-list-{i}' class='w-400 form-control mw-full bg-dark' placeholder={settings.toshoURL + 'rss2?qx=1&q="[SubsPlease] "'} autocomplete='off' bind:value={settings.rssFeedsNew[i][1]} />
        <datalist id='rss-feed-list-{i}'>
          <option value='SubsPlease'>{settings.toshoURL + 'rss2?qx=1&q="[SubsPlease] "'}</option>
          <option value='Erai-raws [Multi-Sub]'>{settings.toshoURL + 'rss2?qx=1&q="[Erai-raws] "'}</option>
          <option value='Yameii [Dubbed]'>{settings.toshoURL + 'rss2?qx=1&q="[Yameii] "'}</option>
          <option value='Judas [Small Size]'>{settings.toshoURL + 'rss2?qx=1&q="[Judas] "'}</option>
        </datalist>
        <div class='input-group-append'>
          <button type='button' use:click={() => { settings.rssFeedsNew.splice(i, 1); settings.rssFeedsNew = settings.rssFeedsNew }} class='btn btn-danger btn-square input-group-append px-5 d-flex align-items-center'><Trash2 size='1.8rem' /></button>
        </div>
      </div>
    {/each}
    <button type='button' use:click={() => { settings.rssFeedsNew[settings.rssFeedsNew.length] = ['New Releases', null] }} class='btn btn-primary mb-10'>Add Feed</button>
  </div>
</SettingCard>
<SettingCard title='Sections And Order' description="Sections and their order on the home screen, if you want more RSS feeds to show up here, create them first in the RSS feed list. Adding many multiple normal lists doesn't impact performance, but adding a lot of RSS feeds will impact app startup times. Drag/drop these sections to re-order them.">
  <div class='position-relative'>
    <HomeSections bind:homeSections={settings.homeSections} />
  </div>
</SettingCard>

<style>
  .mt-7 {
    margin-top: .7rem;
  }
  textarea {
    min-height: 6.6rem;
  }
</style>
