<script>
  import { anilistClient } from '@/modules/anilist.js'
  import { click } from '@/modules/click.js'
  import IPC from '@/modules/ipc.js'
  import { ExternalLink } from 'lucide-svelte'
  import ToggleTitle from '@/views/ViewAnime/ToggleTitle.svelte'
  import Helper from '@/modules/helper.js'

  /** @type {import('@/modules/al.d.ts').Media} */
  export let media
  $: following = anilistClient.userID?.viewer?.data?.Viewer && anilistClient.following({ id: media.id })

  let showMore = false
  function toggleList () {
    showMore = !showMore
  }
</script>

{#await following then res}
  {@const following = [...new Map(res?.data?.Page?.mediaList.filter(item => !Helper.isAuthorized() || item.user.id !== Helper.getUser().id).map(item => [item.user.name, item])).values()]}
  {#if following?.length}
    {#if following.length > 4}
      <span class='d-flex align-items-end pointer' use:click={toggleList}>
        <ToggleTitle size={following.length} title={'Following'} showMore={showMore}></ToggleTitle>
      </span>
    {:else}
      <span class='d-flex align-items-end'>
        <ToggleTitle size={following.length} title={'Following'} showMore={showMore}></ToggleTitle>
      </span>
    {/if}
    <div class='px-15 pt-5 flex-column'>
      {#each following.slice(0, showMore ? 100 : 4) as friend}
        <div class='d-flex align-items-center w-full pt-20 font-size-16'>
          <img src={friend.user.avatar.medium} alt='avatar' class='w-50 h-50 img-fluid rounded cover-img' />
          <span class='my-0 pl-20 mr-auto text-truncate'>{friend.user.name}</span>
          <span class='my-0 px-10 text-capitalize'>{friend.status.toLowerCase()}</span>
          <span class='pointer text-primary d-flex align-items-center' use:click={() => IPC.emit('open', 'https://anilist.co/user/' + friend.user.name)}>
            <ExternalLink size='1.8rem' />
          </span>
        </div>
      {/each}
    </div>
  {/if}
{/await}
