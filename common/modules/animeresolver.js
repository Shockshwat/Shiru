import { anilistClient } from './anilist.js'
import { anitomyscript } from './anime.js'
import { chunks, matchKeys } from './util.js'
import Debug from '@/modules/debug.js'

const debug = Debug('ui:animeresolver')

const postfix = {
  1: 'st', 2: 'nd', 3: 'rd'
}

export default new class AnimeResolver {
  // name: media cache from title resolving
  animeNameCache = {}

  /**
   * @param {import('anitomyscript').AnitomyResult} obj
   * @returns {string}
   */
  getCacheKeyForTitle (obj) {
    let key = obj.anime_title
    if (obj.anime_year) key += obj.anime_year
    if (obj.release_information) key += obj.release_information
    return key
  }

  /**
   * @param {string} title
   * @returns {string[]}
   */
  alternativeTitles (title) {
    const titles = new Set()

    let modified = title
    // preemptively change S2 into Season 2 or 2nd Season, otherwise this will have accuracy issues
    const seasonMatch = title.match(/ S(\d+)/)
    if (seasonMatch) {
      if (Number(seasonMatch[1]) === 1) { // if this is S1, remove the " S1" or " S01"
        modified = title.replace(/ S(\d+)/, '')
        titles.add(modified)
      } else {
        modified = title.replace(/ S(\d+)/, ` ${Number(seasonMatch[1])}${postfix[Number(seasonMatch[1])] || 'th'} Season`)
        titles.add(modified)
        titles.add(title.replace(/ S(\d+)/, ` Season ${Number(seasonMatch[1])}`))
      }
    } else {
      titles.add(title)
    }

    // remove - :
    const specialMatch = modified.match(/[-:]/g)
    if (specialMatch) {
      modified = modified.replace(/[-:]/g, '').replace(/[ ]{2,}/, ' ')
      titles.add(modified)
    }

    // remove (TV)
    const tvMatch = modified.match(/\(tv\)/i)
    if (tvMatch) {
      modified = modified.replace(/\(tv\)/i, '')
      titles.add(modified)
    }

    // Remove (Movie)
    const movieMatch = modified.match(/\(movie\)/i) || modified.match(/movie/i)
    if (movieMatch) {
      modified = modified.replace(/\(movie\)/i, '').replace(/movie/i, '')
      titles.add(modified)
    }

    // Detect and add alternate title within parentheses
    const multiTitleMatch = modified.match(/^(.+?)\s*\((.+?)\)$/)
    if (multiTitleMatch) {
      const [_, mainTitle, altTitle] = multiTitleMatch
      titles.add(mainTitle.trim())
      titles.add(altTitle.trim())
    }
    return [...titles]
  }

  /**
   * resolve anime name based on file name and store it
   * @param {import('anitomyscript').AnitomyResult[]} parseObjects
   */
  async findAnimesByTitle (parseObjects) {
    if (!parseObjects.length) return
    const titleObjects = parseObjects.map(obj => {
      const key = this.getCacheKeyForTitle(obj)
      const titles = this.alternativeTitles(obj.anime_title)
      const titleObjects = titles.flatMap(title => {
        const titleObject = { title, key, isAdult: false }
        const titleVariants = [{ ...titleObject }]
        if (obj.anime_year) {
          titleVariants.unshift({ ...titleObject, year: obj.anime_year })
        }
        if (obj.release_information?.length > 0) {
          if (obj.anime_year) {
            titleVariants.unshift({...titleObject, title: title + " " + obj.release_information, year: obj.anime_year})
          }
          titleVariants.unshift({...titleObject, title: title + " " + obj.release_information})
        }
        return titleVariants
      })
      titleObjects.push({ ...titleObjects.at(-1), isAdult: true })
      return titleObjects
    }).flat()

    debug(`Finding ${titleObjects?.length} titles: ${titleObjects?.map(obj => obj.title).join(', ')}`)
    for (const chunk of chunks(titleObjects, 60)) {
      // single title has a complexity of 8.1, al limits complexity to 500, so this can be at most 62, undercut it to 60, al pagination is 50, but at most we'll do 30 titles since isAdult duplicates each title
      const search = await anilistClient.alSearchCompound(chunk)
      if (search?.errors) throw search.errors[0]
      if (!search) throw {error: {message:'Failed to perform compound search as it returned undefined!'}}
      for (const [key, media] of search) {
        if (!this.animeNameCache[key]) {
          debug(`Found ${key} as ${media?.id}: ${media?.title?.userPreferred}`)
          this.animeNameCache[key] = media
        } else {
          debug(`Duplicate key found ${key} as ${this.animeNameCache[key]?.id}: ${this.animeNameCache[key]?.title?.userPreferred}, skipping new value [${media?.id}: ${media?.title?.userPreferred}]`)
        }
      }
    }
  }

  /**
   * @param {number} id
   */
  async getAnimeById (id) {
    if (anilistClient.mediaCache.value[id]) return anilistClient.mediaCache.value[id]
    const res = await anilistClient.searchIDSingle({ id })

    return res.data.Media
  }

  async findAndCacheTitle(fileName) {
    const parseObjs = await anitomyscript(fileName)
    const TYPE_EXCLUSIONS = ['ED', 'ENDING', 'NCED', 'NCOP', 'OP', 'OPENING', 'PREVIEW', 'PV']

    /** @type {Record<string, import('anitomyscript').AnitomyResult>} */
    const uniq = {}
    for (const obj of parseObjs) {
      const key = this.getCacheKeyForTitle(obj)
      if (key in this.animeNameCache) continue // skip already resolved
      if (obj.anime_type && TYPE_EXCLUSIONS.includes((Array.isArray(obj.anime_type) ? obj.anime_type[0] : obj.anime_type).toUpperCase())) continue // skip non-episode media
      uniq[key] = obj
    }
    await this.findAnimesByTitle(Object.values(uniq))
    return parseObjs
  }

  /**
   * Fixes issues with awful file names from groups like ToonsHub.
   * Because.They.Cant.Take.Two.Seconds.To.Design.A.Better.Name.Scheme.
   *
   * @param fileName Array or fileNames or a single fileName to be cleansed.
   * @returns {*}
   */
  cleanFileName(fileName) {
    const cleanName = (name) => {
      // Preserve specific patterns
      name = name
          .replace(/\b([A-Za-z]{3}\d)\.(\d)\b/g, '<<AUDIO_$1_$2>>')     // For AAC2.0, DDP2.0, etc.
          .replace(/\b(H|X)\.(\d{3})\b/g, '<<RES_$1_$2>>')              // For H.264, H.265, X.265, etc.
          .replace(/\b5\.1\b/g, '<<CHANNEL_5_1>>')                      // For 5.1 channels
          .replace(/\bFLAC5\.1\b/g, '<<AUDIO_FLAC_5_1>>')               // For FLAC5.1
          .replace(/\bVol\.(\d+)\b/g, '<<VOL_$1>>')                     // For Vol. followed by any digits

      // Remove file extensions and replace all remaining periods with spaces
      name = name.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpeg|mpg|3gp|ogg|ogv)$/i, '').replace(/\./g, ' ')

      name = name
          .replace("1-2", "1/2").replace("1_2", "1/2") // Ranma 1/2 fix.

      // Restore preserved patterns by converting markers back
      name = name
          .replace(/<<AUDIO_([A-Za-z]{3}\d)_(\d)>>/g, '$1.$2')          // For AAC2.0, DDP2.0, etc.
          .replace(/<<RES_([HX])_(\d{3})>>/g, '$1.$2')                  // For H.264, H.265, X.265, etc.
          .replace(/<<CHANNEL_5_1>>/g, '5.1')                           // For 5.1 channels
          .replace(/<<AUDIO_FLAC_5_1>>/g, 'FLAC5.1')                    // For FLAC5.1
          .replace(/<<VOL_(\d+)>>/g, 'Vol.$1')                          // For Vol. followed by any digits
      return name
    }
    return typeof fileName === 'string' ? cleanName(fileName) : fileName?.map(name => cleanName(name))
  }

  // TODO: anidb aka true episodes need to be mapped to anilist episodes a bit better, shit like mushoku offsets caused by episode 0's in between seasons
  /**
   * @param {string | string[]} fileName
   * @returns {Promise<any[]>}
   */
  async resolveFileAnime (fileName) {
    if (!fileName) return [{}]
    const parseObjs = await this.findAndCacheTitle(this.cleanFileName(fileName))

    const fileAnimes = []
    for (const parseObj of parseObjs) {

      let failed = false
      let episode
      let media = this.animeNameCache[this.getCacheKeyForTitle(parseObj)]
      let needsVerification = !media || !matchKeys(media, parseObj?.anime_title, ['title.userPreferred', 'title.english', 'title.romaji', 'title.native'], 0.3)
      // resolve episode, if movie, dont.
      let maxep = media?.nextAiringEpisode?.episode || media?.episodes
      debug(`Resolving ${parseObj?.anime_title} ${parseObj?.episode_number} ${maxep} ${media?.title?.userPreferred} ${media?.format}`)
      if ((media?.format !== 'MOVIE' || maxep) && parseObj.episode_number) {
        if (Array.isArray(parseObj.episode_number)) {
          // is an episode range
          if (parseInt(parseObj.episode_number[0]) === 1) {
            debug('Range starts at 1')
            // if it starts with #1 and overflows then it includes more than 1 season in a batch, cant fix this cleanly, name is parsed per file basis so this shouldnt be an issue
            episode = `${parseObj.episode_number[0]} ~ ${parseObj.episode_number[1]}`
          } else {
            if (maxep && parseInt(parseObj.episode_number[1]) > maxep) {
              // get root media to start at S1, instead of S2 or some OVA due to parsing errors
              // this is most likely safe, if it was relative episodes then it would likely use an accurate title for the season
              // if they didnt use an accurate title then its likely an absolute numbering scheme
              // parent check is to break out of those incorrectly resolved OVA's
              // if we used anime season to resolve anime name, then there's no need to march into prequel!
              const prequel = !parseObj.anime_season && (this.findEdge(media, 'PREQUEL')?.node || ((media.format === 'OVA' || media.format === 'ONA') && this.findEdge(media, 'PARENT')?.node))
              debug(`Prequel ${prequel?.id}:${prequel?.title?.userPreferred}`)
              const root = prequel && (await this.resolveSeason({ media: await this.getAnimeById(prequel.id), force: true })).media
              debug(`Root ${root?.id}:${root?.title?.userPreferred}`)

              // if highest value is bigger than episode count or latest streamed episode +1 for safety, parseint to math.floor a number like 12.5 - specials - in 1 go
              let result = await this.resolveSeason({ media: root || media, episode: parseObj.episode_number[1], increment: !parseObj.anime_season ? null : true })

              // last ditch attempt to resolve the correct episode count, resolves most issues especially with Misfit of a Demon King.
              if (result.failed && parseObj.anime_season) {
                result = await this.resolveSeason({ media: root || media, episode: parseObj.episode_number[1] })
              }

              debug(`Found rootMedia for ${parseObj?.anime_title}: ${result?.rootMedia?.id}:${result?.rootMedia?.title?.userPreferred} from ${media?.id}:${media?.title?.userPreferred}`)
              media = result.rootMedia
              const diff = parseObj.episode_number[1] - result.episode
              episode = `${parseObj.episode_number[0] - diff} ~ ${result.episode}`
              failed = result.failed
              if (failed) debug(`Failed to resolve ${parseObj?.anime_title} ${parseObj?.episode_number} ${media?.title?.userPreferred}`)
            } else {
              // cant find ep count or range seems fine
              episode = `${Number(parseObj.episode_number[0])} ~ ${Number(parseObj.episode_number[1])}`
            }
          }
        } else {
          let offset = 0
          // media is missing! Likely a horribly named title for a sequel... try fetching the root.
          if (needsVerification) {
            debug(`Media failed to resolve, attempting to fetch root media for ${parseObj.anime_title}`)
            const parseNew = await this.findAndCacheTitle(parseObj.anime_title.replace(/S\d+(E\d+)?/, ''))
            media = this.animeNameCache[this.getCacheKeyForTitle(parseNew[0])]
            maxep = media?.nextAiringEpisode?.episode || media?.episodes
            offset = (-(media?.episodes || media?.nextAiringEpisode?.episode)) || 0
          }
          if ((maxep && parseInt(parseObj.episode_number) > maxep) || (offset !== 0 && maxep && parseInt(parseObj.episode_number) <= maxep)) {
            // see big comment above
            const prequel = !parseObj.anime_season && (this.findEdge(media, 'PREQUEL')?.node || ((media.format === 'OVA' || media.format === 'ONA') && this.findEdge(media, 'PARENT')?.node))
            debug(`Prequel ${prequel?.id}:${prequel?.title?.userPreferred}`)
            const root = prequel && (await this.resolveSeason({ media: await this.getAnimeById(prequel.id), force: true, offset })).media
            debug(`Root ${root?.id}:${root?.title?.userPreferred}`)

            // check that anime_title is similar to the resolved media title, if it's not then we likely already are at the root level... resolves issues with niche series like MF GHOST.
            let isRoot = false
            if (root && !matchKeys(root, parseObj?.anime_title, ['title.userPreferred', 'title.english', 'title.romaji', 'title.native'], 0.3)) {
              debug(`Detect incorrect Root for ${parseObj?.anime_title}, assuming the title is already root from ${media.id}:${media.title?.userPreferred}`)
              isRoot = true
            }

            // value bigger than episode count
            let result = await this.resolveSeason({ media: (!isRoot ? root : media) || media, episode: parseInt(parseObj.episode_number), increment: !parseObj.anime_season && !isRoot ? null : true, offset })

            // last ditch attempt, see above
            if (result.failed && parseObj.anime_season) {
              debug(`Attempting last ditch effort for failed result ${parseObj.anime_title}: ${result.rootMedia?.id}:${result.rootMedia?.title?.userPreferred} from ${media.id}:${media.title?.userPreferred}`)
              result = await this.resolveSeason({ media: (!isRoot ? root : media) || media, episode: parseInt(parseObj.episode_number), offset })
            }

            debug(`Found rootMedia for ${parseObj.anime_title}: ${result.rootMedia?.id}:${result.rootMedia?.title?.userPreferred} from ${media.id}:${media.title?.userPreferred}`)
            media = result.rootMedia
            episode = result.episode
            failed = result.failed
            if (failed) debug(`Failed to resolve ${parseObj.anime_title} ${parseObj.episode_number} ${media?.title?.userPreferred}`)
          } else {
            // cant find ep count or episode seems fine
            episode = Number(parseObj.episode_number)
          }
        }
      }
      debug(`${failed || !(media?.title?.userPreferred) ? `Failed to resolve` : `Resolved`} ${parseObj.anime_title} ${parseObj.episode_number} ${episode} ${media?.id}:${media?.title?.userPreferred}`)
      fileAnimes.push({
        episode: episode || parseObj.episode_number,
        season: parseObj?.anime_season ? Number(parseObj.anime_season) : 1,
        parseObject: parseObj,
        media,
        failed
      })
    }
    return fileAnimes
  }

  /**
   * @param {import('./al.js').Media} media
   * @param {string} type
   * @param {string[]} [formats]
   * @param {boolean} [skip]
   */
  findEdge (media, type, formats = ['TV', 'TV_SHORT'], skip) {
    let res = media.relations.edges.find(edge => {
      if (edge.relationType === type) {
        return formats.includes(edge.node.format)
      }
      return false
    })
    // this is hit-miss
    if (!res && !skip && type === 'SEQUEL') res = this.findEdge(media, type, formats = ['TV', 'TV_SHORT', 'OVA'], true)
    return res
  }

  // note: this doesn't cover anime which uses partially relative and partially absolute episode number, BUT IT COULD!
  /**
   * @param {{ media: import('./al.js').Media , episode?:number, force?:boolean, increment?:boolean, offset?: number, rootMedia?: import('./al.js').Media }} opts
   * @returns {Promise<{ media: import('./al.js').Media, episode: number, offset: number, increment: boolean, rootMedia: import('./al.js').Media, failed?: boolean }>}
   */
  async resolveSeason (opts) {
    // media, episode, increment, offset, force
    if (!opts.media || !(opts.episode || opts.force)) throw new Error('No episode or media for season resolve!')

    let { media, episode, increment, offset = 0, rootMedia = opts.media, force } = opts

    const rootHighest = (rootMedia.nextAiringEpisode?.episode || rootMedia.episodes)

    const prequel = !increment && this.findEdge(media, 'PREQUEL')?.node
    const sequel = !prequel && (increment || increment == null) && this.findEdge(media, 'SEQUEL')?.node
    const edge = prequel || sequel
    increment = increment ?? !prequel

    if (!edge) {
      const obj = { media, episode: episode - offset, offset, increment, rootMedia, failed: true }
      if (!force) debug(`Failed to resolve ${media.id}:${media.title.userPreferred} ${episode} ${increment} ${offset} ${rootMedia.id}:${rootMedia.title.userPreferred}`)
      return obj
    }
    media = await this.getAnimeById(edge.id)

    const highest = media.nextAiringEpisode?.episode || media.episodes

    const diff = episode - (highest + offset)
    offset += increment ? rootHighest : highest
    if (increment) rootMedia = media

    // force marches till end of tree, no need for checks
    if (!force && diff <= rootHighest) {
      episode -= offset
      return { media, episode, offset, increment, rootMedia }
    }

    return this.resolveSeason({ media, episode, increment, offset, rootMedia, force })
  }
}()
