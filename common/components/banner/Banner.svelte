<script>
  import FullBanner from './FullBanner.svelte'
  import SkeletonBanner from './SkeletonBanner.svelte'
  import ErrorCard from '@/components/cards/ErrorCard.svelte'
  import { settings } from '@/modules/settings.js'
  export let data

  function shuffle (array) {
    let currentIndex = (array.length >= 20 ? 20 : array.length) // We only need the first 20 entries, anything else wouldn't really be high in popularity.
    let randomIndex
    while (currentIndex > 0) {
      randomIndex = Math.floor(Math.random() * currentIndex--);
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
    }
    return array
  }

  function shuffleAndFilter (media) {
    return shuffle(media).filter(media => media.bannerImage || media.trailer?.id || (settings.value.adult === 'hentai' && settings.value.hentaiBanner && media.coverImage?.extraLarge)).slice(0, 5)
  }
</script>

<div class='w-full h-450 position-relative'>
  <!-- really shit and hacky way of fixing scroll position jumping when banner changes height -->
  <div class='position-absolute top-0 transparent h-450 opacity-0'>.</div>
  {#await data}
    <SkeletonBanner />
  {:then res}
    {#if !res.errors}
      <FullBanner mediaList={shuffleAndFilter(res?.data?.Page?.media?.filter(media => media))} />
    {:else}
      <ErrorCard promise={res} />
    {/if}
  {/await}
</div>

<style>
  .opacity-0 {
    opacity: 0;
  }
</style>
