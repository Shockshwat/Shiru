import { writable } from 'simple-store-svelte'
import Bottleneck from 'bottleneck'

import { malToken, refreshMalToken, settings } from '@/modules/settings.js'
import { mediaCache } from '@/modules/cache.js'
import { codes } from "@/modules/anilist.js"
import { toast } from 'svelte-sonner'
import { sleep } from "@/modules/util.js";
import Helper from '@/modules/helper.js'
import Debug from 'debug'

const debug = Debug('ui:myanimelist')

export const clientID = 'bb7dce3881d803e656c45aa39bda9ccc' // app type MUST be set to other, do not generate a seed.

function printError (error) {
  debug(`Error: ${error.status || error || 429} - ${error.message || codes[error.status || error || 429]}`)
  if (settings.value.toasts.includes('All') || settings.value.toasts.includes('Errors')) {
    toast.error('Search Failed', {
      description: `Failed making request to MyAnimeList!\nTry again in a minute.\n${error.status || error || 429} - ${error.message || codes[error.status || error || 429]}`,
      duration: 3000
    })
  }
}

const queryFields =  [
  'synopsis',
  'alternative_titles',
  'mean',
  'rank',
  'popularity',
  'num_list_users',
  'num_scoring_users',
  'related_anime',
  'media_type',
  'num_episodes',
  'status',
  'my_list_status',
  'start_date',
  'end_date',
  'start_season',
  'broadcast',
  'studios',
  'authors{first_name,last_name}',
  'source',
  'genres',
  'average_episode_duration',
  'rating'
]

class MALClient {
  limiter = new Bottleneck({
    reservoir: 20,
    reservoirRefreshAmount: 20,
    reservoirRefreshInterval: 4 * 1000,
    maxConcurrent: 2,
    minTime: 1000
  })

  rateLimitPromise = null

  /** @type {import('simple-store-svelte').Writable<ReturnType<MALClient['getUserLists']>>} */
  userLists = writable()

  userID = malToken

  constructor () {
    debug('Initializing MyAnimeList Client for ID ' + this.userID?.viewer?.data?.Viewer?.id)
    this.limiter.on('failed', async (error, jobInfo) => {
      printError(error)

      if (error.status === 500) return 1

      if (!error.statusText) {
        if (!this.rateLimitPromise) this.rateLimitPromise = sleep(5 * 1000).then(() => { this.rateLimitPromise = null })
        return 5 * 1000
      }
      const time = ((error.headers.get('retry-after') || 5) + 1) * 1000
      if (!this.rateLimitPromise) this.rateLimitPromise = sleep(time).then(() => { this.rateLimitPromise = null })
      return time
    })

    if (this.userID?.viewer?.data?.Viewer) {
      this.userLists.value = this.getUserLists({ sort: 'list_updated_at' })
      //  update userLists every 15 mins
      setInterval(async () => {
        const updatedLists = await this.getUserLists({ sort: 'list_updated_at' })
        this.userLists.value = Promise.resolve(updatedLists) // no need to have userLists await the entire query process while we already have previous values, (it's awful to wait 15+ seconds for the query to succeed with large lists)
      }, 1000 * 60 * 15)
    }
  }

  /**
   * @param {Record<string, any>} query
   * @param {Record<string, any>} body
   * @returns {Promise<import('./mal').Query<any>>}
   */
  malRequest (query, body = {}) {
    /** @type {RequestInit} */
    const options = {
      method: `${query.type}`,
      headers: {
        'Authorization': `Bearer ${query.eToken ? query.eToken : query.token ? query.token : this.userID.token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
    if (Object.keys(body).length > 0) {
      options.body = new URLSearchParams(body)
    }
		return this.handleRequest(query, options);
	}

	async jikanRequest(query) {
		const res = await fetch(`https://api.jikan.moe/v4/${query}`, {
			method: "GET",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		});
		if (!res.ok) {
			throw new Error(`Jikan request failed: ${res.status}`);
		}
		return res.json();
  }

  failedRefresh = []

  /**
   * @param {Record<string, any>} query
   * @param {Record<string, any>} options
   * @returns {Promise<import('./mal').Query<any>>}
   */
  handleRequest = this.limiter.wrap(async (query, options) => {
    await this.rateLimitPromise
    let res = {}
    if (!query.eToken && (this.failedRefresh.includes(query.token ? query.token : this.userID.token) || (!query.token && this.userID.reauth))) return {}
    try {
      if (!query.eToken && (Math.floor(Date.now() / 1000) >= ((query.token ? query.refresh_in : this.userID.refresh_in) || 0))) {
        const oauth = await this.refreshToken(query)
        if (oauth) {
          options.headers = {
            'Authorization': `Bearer ${oauth.access_token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        } else return {}
      }
      res = await fetch(`https://api.myanimelist.net/v2/${query.path}`, options)
    } catch (e) {
      if (!res || res.status !== 404) throw e
    }
    if (!res?.ok && (res?.status === 429 || res?.status === 500)) {
      throw res
    }
    let json = null
    try {
      json = await res.json()
    } catch (error) {
      if (res?.ok) printError(error)
    }
    if (!res?.ok && res?.status !== 404) {
      if (json) {
        for (const error of json?.errors || [json?.error] || []) {
          let code = error
          switch (error) {
            case 'forbidden':
              code = 403
              break
            case 'invalid_token':
              code = 401
              const oauth = await this.refreshToken(query)
              if (oauth) {
                options.headers = {
                  'Authorization': `Bearer ${oauth.access_token}`,
                  'Content-Type': 'application/x-www-form-urlencoded'
                }
                return this.handleRequest(query, options)
              } else return {}
            case 'invalid_content':
              code = 422
              break
            default:
              code = res?.status
          }
          printError(code)
        }
      } else {
        printError(res)
      }
    }
    return json
  })

  async refreshToken(query) {
    const oauth = await refreshMalToken(query.token ? query.token : this.userID.token) // refresh authorization token as it typically expires every 31 days. Refresh token also expires every 31 days, so we refresh every two weeks.
    if (oauth) {
      if (!query.token) {
        this.userID = malToken
      }
      return oauth
    }
    this.failedRefresh.push(query.token ? query.token : this.userID.token)
    return oauth
  }

  async malEntry (media, variables) {
    variables.idMal = media.idMal
    const res = await malClient.entry(variables)
    if (!variables.token) mediaCache.value[media.id].mediaListEntry = res?.data?.SaveMediaListEntry
    return res
  }

  /** @returns {Promise<import('./mal').Query<{ MediaList: import('./mal').MediaList }>>} */
  async getUserLists (variables) {
    debug('Getting user lists')
    const limit = 1000 // max possible you can fetch
    let offset = 0
    let allMediaList = []
    let hasNextPage = true

    // Check and replace specific sort values
    const customSorts = ['list_start_date_nan', 'list_finish_date_nan', 'list_progress_nan']
    if (customSorts.includes(variables.sort)) {
      variables.originalSort = variables.sort
      variables.sort = 'list_updated_at'
    }
    while (hasNextPage) {
      const query = {
        type: 'GET',
        path: `users/@me/animelist?fields=${queryFields}&nsfw=true&limit=${limit}&offset=${offset}&sort=${variables.sort}`
      }
      const res = await this.malRequest(query)
      allMediaList = res?.data ? allMediaList.concat(res.data) : []

      if ((res?.data?.length < limit) || !res?.data) {
        hasNextPage = false
      } else {
        offset += limit
      }
    }
    // Custom sorting based on original variables.sort value
    if (variables.originalSort === 'list_start_date_nan') {
      allMediaList?.sort((a, b) => {
        return new Date(b.node.my_list_status.start_date) - new Date(a.node.my_list_status.start_date)
      })
    } else if (variables.originalSort === 'list_finish_date_nan') {
      allMediaList?.sort((a, b) => {
        return new Date(b.node.my_list_status.finish_date) - new Date(a.node.my_list_status.finish_date)
      })
    } else if (variables.originalSort === 'list_progress_nan') {
      allMediaList?.sort((a, b) => {
        return b.node.my_list_status.num_episodes_watched - a.node.my_list_status.num_episodes_watched
      })
    }

    return { data: { MediaList: allMediaList } }
  }

  /** @returns {Promise<import('./mal').Query<{ Viewer: import('./mal').Viewer }>>} */
  async viewer (token) {
    debug('Getting viewer')
    const query = {
      type: 'GET',
      path: 'users/@me',
      eToken: token
    }
    const res = await this.malRequest(query)
    const viewer = { data: { Viewer: res } }
    if (viewer?.data?.Viewer && !viewer?.data?.Viewer?.picture) {
      viewer.data.Viewer.picture = 'https://cdn.myanimelist.net/images/kaomoji_mal_white.png' // set default image if user doesn't have an image, viewer doesn't return the default image if none is set for whatever reason...
    }
    return viewer
  }

  async entry (variables) {
    debug(`Updating entry for ${variables.idMal}`)
    const query = {
      type: 'PUT',
      path: `anime/${variables.idMal}/my_list_status`,
      token: variables.token,
      refresh_in: variables.refresh_in
    }
    const padNumber = (num) => num !== undefined && num !== null ? String(num).padStart(2, '0') : null
    const start_date = variables.startedAt?.year && variables.startedAt.month && variables.startedAt.day ? `${variables.startedAt.year}-${padNumber(variables.startedAt.month)}-${padNumber(variables.startedAt.day)}` : null
    const finish_date = variables.completedAt?.year && variables.completedAt.month && variables.completedAt.day ? `${variables.completedAt.year}-${padNumber(variables.completedAt.month)}-${padNumber(variables.completedAt.day)}` : null
    const updateData = {
      status: Helper.statusMap(variables.status),
      is_rewatching: variables.status?.includes('REPEATING'),
      num_watched_episodes: variables.episode || 0,
      num_times_rewatched: variables.repeat || 0,
      score: variables.score || 0
    }
    if (start_date) {
      updateData.start_date = start_date
    }
    if (finish_date) {
      updateData.finish_date = finish_date
    }
    const res = await this.malRequest(query, updateData)
    setTimeout(async () => {
      if (!variables.token) this.userLists.value = Promise.resolve(await this.getUserLists({ sort: 'list_updated_at' })) // awaits before setting the value as it is super jarring to have stuff constantly re-rendering when it's not needed.
    })
    return res ? {
      data: {
        SaveMediaListEntry: {
          id: variables.id,
          status: variables.status,
          progress: variables.episode,
          score: variables.score,
          repeat: variables.repeat,
          startedAt: variables.startedAt,
          completedAt: variables.completedAt,
          customLists: []
        }
      }
    } : res
  }

  async delete (variables) {
    debug(`Deleting entry for ${variables.idMal}`)
    const query = {
      type: 'DELETE',
      path: `anime/${variables.idMal}/my_list_status`,
      token: variables.token,
      refresh_in: variables.refresh_in
    }
    const res = await this.malRequest(query)
    setTimeout(async () => {
			if (!variables.token)
				this.userLists.value = Promise.resolve(
					await this.getUserLists({ sort: "list_updated_at" })
				); // awaits before setting the value as it is super jarring to have stuff constantly re-rendering when it's not needed.
		});
		return res;
	}

	async malSearchCompound(flattenedTitles) {
		debug(`Searching for ${flattenedTitles.title}`);

		if (!flattenedTitles.length) return [];
		const query = {
			type: "GET",
			path: `anime?q=${flattenedTitles.title}&limit=5&fields=id,title,alternative_titles,start_season`,
		};
		const rest = await this.malRequest(query);
		if (rest?.data) {
			const searchResults = rest.data.map((result) => ({
				id: result.id,
				title: {
					english: result.alternative_titles.en,
					native: result.alternative_titles.ja,
				},
				synonyms: result.alternative_titles.synonyms,
				seasonYear: result.start_season.year,
				isAdult: !(result.nsfw == "white"),
			}));
			return searchResults;
		}
	}

	search(variables = {}) {
		debug(`Searching for ${variables.q}`);

		const queryParams = new URLSearchParams({
			q: variables.q || "",
			page: variables.page || 1,
			limit: variables.limit || 10,
			type: variables.type || "",
			score: variables.score || "",
			min_score: variables.min_score || "",
			max_score: variables.max_score || "",
			status: variables.status || "",
			rating: variables.rating || "",
			sfw: variables.sfw || "",
			genres: variables.genres || "",
			genres_exclude: variables.genres_exclude || "",
			order_by: variables.order_by || "",
			sort: variables.sort || "",
			letter: variables.letter || "",
			producers: variables.producers || "",
			start_date: variables.start_date || "",
			end_date: variables.end_date || "",
			unapproved: variables.unapproved || "",
		});

		const query = `anime?${queryParams.toString()}`;

		return this.jikanRequest(query).then(async (res) => {
			if (!res?.data) {
				debug("No results found.");
				return [];
			}

			const results = await Promise.all(
				res.data.map(async (anime) => {
					const episodesQuery = `anime/${anime.mal_id}/episodes`;
					const episodesRes = await this.jikanRequest(episodesQuery);

					const streamingEpisodes = episodesRes?.data?.map((episode) => ({
						title: episode.title,
						thumbnail: episode.url,
					}));

					return {
				id: anime.mal_id,
				title: {
					romaji: anime.title,
					english: anime.title_english,
					native: anime.title_japanese,
					userPreferred: anime.title,
				},
				description: anime.synopsis,
				season: anime.season?.toUpperCase(),
				seasonYear: anime.year,
				format: anime.type,
				status: anime.status,
				episodes: anime.episodes,
				duration: anime.duration
					? parseInt(anime.duration.split(" ")[0])
					: null,
				averageScore: anime.score ? Math.round(anime.score * 10) : null,
				genres: anime.genres?.map((genre) => genre.name) || [],
				isAdult: anime.rating?.toLowerCase().includes("r-17") || false,
				coverImage: {
					extraLarge: anime.images?.jpg?.large_image_url,
					medium: anime.images?.jpg?.image_url,
					color: null,
				},
				source: anime.source,
						studios: anime.studios?.map((studio) => studio.name) || [],
				countryOfOrigin: "JP",
				isFavourite: false,
				synonyms: anime.title_synonyms || [],
				trailer: anime.trailer?.url
					? {
							id: anime.trailer.youtube_id,
							site: "youtube",
					  }
					: null,
						streamingEpisodes: streamingEpisodes || [],
					};
				})
			);

			return results;
		});
	}

	async episodes(variables = {}) {
		debug(`Getting episodes for ${variables.id}`);
		const query = `anime/${variables.id}/episodes`;
		return this.jikanRequest(query).then((res) => {
			if (!res?.data) {
				debug("No episodes found.");
				return [];
			}
			return res.data.map((episode) => ({
				episode: episode.mal_id,
				airingAt: new Date(episode.aired).getTime(),
			}));
		});
	}

	episodeDate(variables) {
		debug(`Searching for episode date: ${variables.id}, ${variables.ep}`);
		const query = `anime/${variables.id}/episodes/${variables.ep}`;
		return this.jikanRequest(query).then((res) => {
			if (!res?.data) {
				debug("No episode date found.");
				return null;
		}
			return { airingAt: new Date(res.data.aired).getTime() };
		});
	}

	async recommendations(variables) {
		debug(`Fetching recommendations for media ID ${variables.id}`);
		const res = await this.jikanRequest(
			`anime/${variables.id}/recommendations`
		);
		if (!res?.data) {
			debug("No recommendations found.");
			return [];
		}

		return res.data.map((recommendation) => ({
			id: recommendation.entry.mal_id,
			title: recommendation.entry.title,
			imageUrl: recommendation.entry.images.jpg.image_url,
		}));
	}

	searchIDSingle(variables) {
		debug(`Searching for ID: ${variables?.idMal}`);
		const query = `anime/${variables.idMal}`;
		return this.jikanRequest(query).then((res) => {
			if (!res?.data) {
				debug("No results found.");
				return null;
			}
			const anime = res.data;
			return {
				id: anime.mal_id,
				title: {
					romaji: anime.title,
					english: anime.title_english,
					native: anime.title_japanese,
					userPreferred: anime.title,
				},
				description: anime.synopsis,
				season: anime.season?.toUpperCase(),
				seasonYear: anime.year,
				format: anime.type,
				status: anime.status,
				episodes: anime.episodes,
				duration: anime.duration
					? parseInt(anime.duration.split(" ")[0])
					: null,
				averageScore: anime.score ? Math.round(anime.score * 10) : null,
				genres: anime.genres?.map((genre) => genre.name) || [],
				isAdult: anime.rating?.toLowerCase().includes("r-17") || false,
				coverImage: {
					extraLarge: anime.images?.jpg?.large_image_url,
					medium: anime.images?.jpg?.image_url,
					color: null,
				},
				source: anime.source,
				countryOfOrigin: "JP",
				isFavourite: false,
				synonyms: anime.title_synonyms || [],
				nextAiringEpisode: anime.airing
					? {
							airingAt: new Date(anime.aired?.prop?.from).getTime(),
							episode: anime.episodes || 1,
					  }
					: null,
				trailer: anime.trailer?.url
					? {
							id: anime.trailer.youtube_id,
							site: "youtube",
					  }
					: null,
			};
		});
	}

	searchIDS(variables) {
		debug(`Searching for IDs: ${JSON.stringify(variables.ids)}`);
		const promises = variables.ids.map((id) =>
			this.searchIDSingle({ idMal: id })
		);
		return Promise.all(promises).then((results) =>
			results.filter((result) => result)
		);
	}

	async searchAllIDS(variables) {
		debug(`Searching for all IDs: ${JSON.stringify(variables.ids)}`);
		const results = [];
		for (const id of variables.ids) {
			const result = await this.searchIDSingle({ idMal: id });
			if (result) results.push(result);
		}
		return results;
	}
}

export const malClient = new MALClient();
