<script>
  import { SUPPORTS } from '@/modules/support.js'

  export let title
  export let size = 0
  export let showMore = false
</script>
<div class='w-full d-flex flex-row align-items-center pt-20 mt-10'>
  <hr class='w-full' />
  <div class='title position-absolute font-size-18 font-weight-semi-bold px-20 text-white'>{title}</div>
  <hr class='w-full' />
  {#if size > 4 && !SUPPORTS.isAndroid}
    <div class='ml-auto pl-20 font-size-12 more text-muted text-nowrap'>{showMore ? 'Show Less' : 'Show More'}</div>
  {/if}
</div>

<style>
  .title {
    left: 50%;
    transform: translateX(-50%);
  }
  .more:hover {
    color: var(--dm-link-text-color-hover) !important;
  }
</style>
