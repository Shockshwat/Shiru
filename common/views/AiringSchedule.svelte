<script context='module'>
  import SectionsManager from '@/modules/sections.js'
  import Search, { search } from './Search.svelte'
  import { anilistClient, currentSeason, currentYear } from '@/modules/anilist.js'
  import { animeSchedule } from "@/modules/animeschedule"
  import Helper from "@/modules/helper.js"

  const vars = { scheduleList: true, format: 'TV', season: currentSeason, year: currentYear }

  async function fetchAllScheduleEntries (_variables) {
    let variables = { ..._variables }
    const results = { data: { Page: { media: [], pageInfo: { hasNextPage: false } } } }
    const opts = { ...vars, ...SectionsManager.sanitiseObject(variables) }
    const hideSubs = variables.hideSubs ? { idMal: (await animeSchedule.airingLists.value).map(result => result.media?.idMal).filter(idMal => idMal !== undefined) } : {}
    const hideMyAnime = (variables.hideMyAnime && Helper.isAuthorized()) ? {[Helper.isAniAuth() ? 'id_not' : 'idMal_not']:
            await Helper.userLists(variables).then(res => {
                return Helper.isAniAuth()
                    ? Array.from(new Set(res.data.MediaListCollection.lists.filter(({ status }) => variables.hideStatus.includes(status)).flatMap(list => list.entries.map(({ media }) => media.id))))
                    : res.data.MediaList.filter(({ node }) => variables.hideStatus.includes(Helper.statusMap(node.my_list_status.status))).map(({ node }) => node.id)
            })} : {}
    for (let page = 1, hasNextPage = true; hasNextPage && page < 5; ++page) {
      const res = await anilistClient.search({ ...opts, ...hideSubs, ...hideMyAnime, page, perPage: 50 })
      hasNextPage = res.data.Page.pageInfo.hasNextPage
      results.data.Page.media = results.data.Page.media.concat(res.data.Page.media)
    }
    const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
    const schedule = !variables.hideSubs ? {
        year: vars.season === 'WINTER' ? vars.year - 1 : vars.year,
        season: seasons.at(seasons.indexOf(vars.season) - 1),
        status: 'RELEASING'
    } : {}

    const res = await anilistClient.search({ ...hideSubs, ...hideMyAnime, ...SectionsManager.sanitiseObject(variables), ...schedule, page: 1, perPage: 50 })
    results.data.Page.media = results.data.Page.media.concat(res.data.Page.media)
      if (variables.hideSubs) {
          for (const media of results.data.Page.media) {
              const cachedItem = (await animeSchedule.airingLists.value).find(cached => cached.media.id === media.id)
              if (cachedItem && cachedItem.media.airingSchedule) {
                  media.airingSchedule = cachedItem.media.airingSchedule
              }
          }

          // filter out any completed dubs
          results.data.Page.media = results.data.Page.media.filter(media => !(media.airingSchedule?.nodes?.[0]?.episode > media.episodes) || !media.episodes)
      }

    // filter out entries without airing schedule and duplicates [only allow first occurrence]
    results.data.Page.media = results.data.Page.media.filter((media, index, self) => media.airingSchedule?.nodes?.[0]?.airingAt && self.findIndex(m => m.id === media.id) === index)

    results.data.Page.media.sort((a, b) => a.airingSchedule?.nodes?.[0]?.airingAt - b.airingSchedule?.nodes?.[0]?.airingAt)

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
