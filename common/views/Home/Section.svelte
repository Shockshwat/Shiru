<script context='module'>
  const fakecards = Array.from({ length: 15 }, () => ({ data: new Promise(() => {}) }))
</script>

<script>
  import Card from '@/components/cards/Card.svelte'
  import ErrorCard from '@/components/cards/ErrorCard.svelte'
  import { search } from '../Search.svelte'
  import { page } from '@/App.svelte'
  import { click } from '@/modules/click.js'
  import { ChevronLeft, ChevronRight } from 'lucide-svelte'

  export let lastEpisode = false
  export let opts

  function deferredLoad (element) {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!opts.preview.value) opts.preview.value = opts.load(1, 50, { ...opts.variables })
        observer.unobserve(element)
      }
    }, { threshold: 0 })
    observer.observe(element)

    return { destroy () { observer.unobserve(element) } }
  }

  function _click () {
    $search = {
      ...opts.variables,
      load: opts.load,
      title: opts.title,
    }
    $page = 'search'
  }
  const preview = opts.preview

  let scrollContainer
  function scrollCarousel(direction) {
    const maxScrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth
    const scrollAmount = scrollContainer.offsetWidth
    if (direction === 'right' && scrollContainer.scrollLeft >= maxScrollLeft) scrollContainer.scrollLeft = 0
    else if (direction === 'left' && scrollContainer.scrollLeft <= 0) scrollContainer.scrollLeft = maxScrollLeft
    else scrollContainer.scrollBy({ left: direction === 'right' ? scrollAmount : -scrollAmount, behavior: 'smooth' })
  }
</script>

<span class='d-flex px-20 align-items-end text-decoration-none' class:mv-10={lastEpisode} use:deferredLoad>
  <div class='font-size-24 font-weight-semi-bold glow text-muted pointer' use:click={_click}>{opts.title}</div>
  <div class='ml-auto pr-5 pl-5 pt-5 font-size-12 glow text-muted pointer btn' use:click={() => scrollCarousel('left')}><ChevronLeft strokeWidth='3' size='2rem' /></div>
  <div class='pr-5 pl-5 pt-5 ml-10 font-size-12 glow text-muted pointer btn' use:click={() => scrollCarousel('right')}><ChevronRight strokeWidth='3' size='2rem' /></div>
</span>
<div class='position-relative'>
  <div class='pb-10 w-full d-flex flex-row justify-content-start gallery' bind:this={scrollContainer}>
    {#each $preview || fakecards as card}
      <Card {card} variables={{...opts.variables, section: true}} />
    {/each}
    {#if $preview?.length}
      <ErrorCard promise={$preview[0].data} />
    {/if}
  </div>
</div>

<style>
  .btn {
    border-radius: 2rem;
  }
  .gallery :global(.first-check:first-child) :global(.absolute-container) {
    left: -48% !important;
  }
  .glow:hover {
    color: var(--dm-link-text-color-hover) !important;
  }
  .gallery:after {
    content: '';
    position: absolute;
    right: 0;
    height: 100%;
    width: 8rem;
    background: var(--section-end-gradient);
    pointer-events: none;
  }
  .gallery {
    overflow-x: scroll;
    flex-shrink: 0;
    scroll-behavior: smooth;
  }
  .mv-10 {
    margin-top: -10rem !important;
    z-index: 0 !important;
  }
  .gallery :global(.item.small-card) {
    width: 19rem !important;
  }
  .gallery::-webkit-scrollbar {
    display: none;
  }
</style>
