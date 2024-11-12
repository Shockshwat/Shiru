<script>
  import SkeletonCard from './SkeletonCard.svelte'
  import SmallCard from './SmallCard.svelte'
  import EpisodeSkeletonCard from './EpisodeSkeletonCard.svelte'
  import FullCard from './FullCard.svelte'
  import EpisodeCard from './EpisodeCard.svelte'
  import FullSkeletonCard from './FullSkeletonCard.svelte'
  import { settings } from '@/modules/settings.js'
  import { anilistClient } from '@/modules/anilist.js'

  export let card

  export let variables = null
  const type = card.type || $settings.cards
</script>

{#if type === 'episode'}

  {#await card.data}
    <EpisodeSkeletonCard section={variables?.section} />
  {:then data}
    {#if data}
      <EpisodeCard {data} section={variables?.section} />
    {/if}
  {/await}

{:else if type === 'full'}

  {#await card.data}
    <FullSkeletonCard />
  {:then media}
    {#if media}
      <FullCard media={anilistClient.mediaCache.value[media.id]} {variables} />
    {/if}
  {/await}

{:else} <!-- type === 'small'  -->

  {#await card.data}
    <SkeletonCard />
  {:then media}
    {#if media}
      <SmallCard media={anilistClient.mediaCache.value[media.id]} {variables} />
    {/if}
  {/await}

{/if}
