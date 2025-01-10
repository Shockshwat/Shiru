<script context='module'>
  import SectionsManager, { sections } from '@/modules/sections.js'
  import { settings } from '@/modules/settings.js'
  import { anilistClient, currentSeason, currentYear } from '@/modules/anilist.js'
  import Helper from '@/modules/helper.js'
  import { writable } from 'svelte/store'

  const bannerData = writable(getTitles())
  // Refresh banner every 15 minutes
  setInterval(() => getTitles(true), 5 * 60 * 1000)

  async function getTitles(refresh) {
    const res = anilistClient.search({ method: 'Search', sort: 'POPULARITY_DESC', perPage: 15, onList: false, season: currentSeason, year: currentYear, status_not: 'NOT_YET_RELEASED' })
    if (refresh) {
      const renderData = await res
      bannerData.set(Promise.resolve(renderData))
    }
    else return res
  }

  const manager = new SectionsManager()

  const mappedSections = {}

  for (const section of sections) {
    mappedSections[section.title] = section
  }

  for (const sectionTitle of settings.value.homeSections) manager.add(mappedSections[sectionTitle[0]])

  if (Helper.getUser()) {
    const userSections = ['Continue Watching', 'Sequels You Missed', 'Stories You Missed', 'Planning List', 'Completed List', 'Paused List', 'Dropped List', 'Watching List']
    Helper.getClient().userLists.subscribe(value => {
      if (!value) return
      for (const section of manager.sections) {
        // remove preview value, to force UI to re-request data, which updates it once in viewport
        if (userSections.includes(section.title) && !section.hide) section.preview.value = section.load(1, 50, section.variables)
      }
    })
  }

  const isPreviousRSS = (i) => {
    let index = i - 1
    while (index >= 0) {
      if (!manager.sections[index]?.hide) return manager.sections[index]?.isRSS ?? false
      else if ((index - 1 >= 0) && manager.sections[index - 1]?.isRSS) return true
      index--
    }
    return false
  }
</script>

<script>
  import Section from './Section.svelte'
  import Banner from '@/components/banner/Banner.svelte'
  import smoothScroll from '@/modules/scroll.js'
</script>

<div class='h-full w-full overflow-y-scroll root overflow-x-hidden' use:smoothScroll>
  <Banner data={$bannerData} />
  <div class='d-flex flex-column h-full w-full mt-15'>
    {#each manager.sections as section, i (i)}
      {#if !section.hide}
        <Section bind:opts={section} lastEpisode={isPreviousRSS(i)}/>
      {/if}
    {/each}
  </div>
</div>
