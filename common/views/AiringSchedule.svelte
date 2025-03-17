<script context='module'>
  import SectionsManager from '@/modules/sections.js'
  import Search, { search } from './Search.svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime.js'
  import { animeSchedule } from '@/modules/animeschedule.js'
  import Helper from '@/modules/helper.js'

  const vars = { scheduleList: true, format: ['TV'], format_not: [] }

  async function fetchAllScheduleEntries (variables) {
    const results = { data: { Page: { media: [], pageInfo: { hasNextPage: false } } } }
    const airingLists = await (variables.hideSubs ? animeSchedule.dubAiringLists.value : animeSchedule.subAiringLists.value)
    const ids = { idMal: airingLists.map(entry => variables.hideSubs ? entry.media?.media?.idMal : entry.idMal).filter(idMal => idMal !== undefined) }
    const hideMyAnime = (variables.hideMyAnime && Helper.isAuthorized()) ? {[Helper.isAniAuth() ? 'id_not' : 'idMal_not']:
            await Helper.userLists(variables).then(res => {
                if (!res?.data && res?.errors) throw res.errors[0]
                return Helper.isAniAuth()
                    ? Array.from(new Set(res.data.MediaListCollection.lists.filter(({ status }) => variables.hideStatus.includes(status)).flatMap(list => list.entries.map(({ media }) => media.id))))
                    : res.data.MediaList.filter(({ node }) => variables.hideStatus.includes(Helper.statusMap(node.my_list_status.status))).map(({ node }) => node.id)
            })} : {}
    const res = await anilistClient.searchAllIDS({ ...ids, ...hideMyAnime, ...SectionsManager.sanitiseObject(variables), page: 1, perPage: 50 })
    if (!res?.data && res?.errors) throw res.errors[0]
    results.data.Page.media = results.data.Page.media.concat(res.data.Page.media)
    if (variables.hideSubs) {
      // filter out entries without airing schedule, duplicates [only allow first occurrence], and completed dubs, then sort entries from first airing to last airing.
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => {
        const cachedItem = airingLists.find(entry => entry.media?.media?.id === media.id)
        if (cachedItem?.delayedIndefinitely && cachedItem?.status?.toUpperCase()?.includes('FINISHED')) { // skip these as they are VERY likely partial dubs so production isn't necessarily in a suspended state.
          return false
        }
        if (cachedItem?.media?.media?.airingSchedule?.nodes?.length) {
            const airingFirst = new Date(Math.min(...cachedItem.media.media.airingSchedule.nodes.map(node => new Date(node.airingAt))))
            if (airingFirst < new Date()) {
                const highestEpisode = Math.max(...cachedItem.media.media.airingSchedule.nodes.filter(node => new Date(node.airingAt).getTime() === airingFirst.getTime()).map(node => node.episode))
                cachedItem.media.media.airingSchedule.nodes[0].episode = highestEpisode + 1
                cachedItem.media.media.airingSchedule.nodes[0].airingAt = new Date(airingFirst.getTime() + (cachedItem.delayedIndefinitely ? 6 * 365 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, -5) + 'Z'
            }
        }
        return (!(cachedItem?.media?.media?.airingSchedule?.nodes[0]?.episode > media.episodes) || !media.episodes) && cachedItem?.media?.media?.airingSchedule?.nodes[0]?.airingAt && self.findIndex(m => m.id === media.id) === index
      }).sort((a, b) => {
          const aEntry = airingLists.find(entry => entry.media?.media?.id === a.id)
          const bEntry = airingLists.find(entry => entry.media?.media?.id === b.id)
          const aDelayed = aEntry?.delayedIndefinitely ? 1 : 0
          const bDelayed = bEntry?.delayedIndefinitely ? 1 : 0
          if (aDelayed !== bDelayed) return aDelayed - bDelayed
          return new Date(aEntry?.media?.media?.airingSchedule?.nodes[0]?.airingAt).getTime() - new Date(bEntry?.media?.media?.airingSchedule?.nodes[0]?.airingAt).getTime()
      })
    } else {
      // filter out entries without airing schedule and duplicates [only allow first occurrence], then sort entries from first airing to last airing.
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => nextAiring(media?.airingSchedule?.nodes)?.airingAt && self.findIndex(m => m?.id === media?.id) === index).sort((a, b) => nextAiring(a.airingSchedule?.nodes)?.airingAt - nextAiring(b.airingSchedule?.nodes)?.airingAt)
    }
    return results
  }
</script>

<script>
  $search = {
    ...vars,
    load: (_, __, variables) => SectionsManager.wrapResponse(fetchAllScheduleEntries(variables), 150)
  }
</script>

<Search />
