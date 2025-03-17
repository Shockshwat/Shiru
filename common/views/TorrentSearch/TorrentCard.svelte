<script context='module'>
  import { click } from '@/modules/click.js'
  import { matchPhrase } from '@/modules/util.js'
  import { fastPrettyBytes, since } from '@/modules/util.js'
  import { Database, BadgeCheck } from 'lucide-svelte'
  import { toast } from 'svelte-sonner'

  /** @typedef {import('@thaunknown/ani-resourced/sources/types.d.ts').Result} Result */
  /** @typedef {import('anitomyscript').AnitomyResult} AnitomyResult */

  const termMapping = {}
  termMapping['5.1'] = { text: '5.1', color: '#f67255' }
  termMapping['5.1CH'] = termMapping[5.1]
  termMapping['TRUEHD5.1'] = { text: 'TrueHD 5.1', color: '#f67255' }
  termMapping.AAC = { text: 'AAC', color: '#f67255' }
  termMapping.AACX2 = termMapping.AAC
  termMapping.AACX3 = termMapping.AAC
  termMapping.AACX4 = termMapping.AAC
  termMapping.AC3 = { text: 'AC3', color: '#f67255' }
  termMapping.EAC3 = { text: 'EAC3', color: '#f67255' }
  termMapping['E-AC-3'] = termMapping.EAC3
  termMapping.FLAC = { text: 'FLAC', color: '#f67255' }
  termMapping.FLACX2 = termMapping.FLAC
  termMapping.FLACX3 = termMapping.FLAC
  termMapping.FLACX4 = termMapping.FLAC
  termMapping.VORBIS = { text: 'Vorbis', color: '#f67255' }
  termMapping.DUALAUDIO = { text: 'Dual Audio', color: '#f67255' }
  termMapping.ENGLISHAUDIO = { text: 'English Audio', color: '#f67255' }
  termMapping['DUB'] = termMapping.ENGLISHAUDIO
  termMapping['DUAL'] = termMapping.DUALAUDIO
  termMapping['DUAL AUDIO'] = termMapping.DUALAUDIO
  termMapping['MULTI AUDIO'] = termMapping.DUALAUDIO
  termMapping['ENGLISH AUDIO'] = termMapping.ENGLISHAUDIO
  termMapping['ENGLISH DUB'] = termMapping.ENGLISHAUDIO
  termMapping['10BIT'] = { text: '10 Bit', color: '#0c8ce9' }
  termMapping['10BITS'] = termMapping['10BIT']
  termMapping['10-BIT'] = termMapping['10BIT']
  termMapping['10-BITS'] = termMapping['10BIT']
  termMapping.HI10 = termMapping['10BIT']
  termMapping.HI10P = termMapping['10BIT']
  termMapping.HI444 = { text: 'HI444', color: '#0c8ce9' }
  termMapping.HI444P = termMapping.HI444
  termMapping.HI444PP = termMapping.HI444
  termMapping.HEVC = { text: 'HEVC', color: '#0c8ce9' }
  termMapping.H265 = termMapping.HEVC
  termMapping['H.265'] = termMapping.HEVC
  termMapping.X265 = termMapping.HEVC
  termMapping.AV1 = { text: 'AV1', color: '#0c8ce9' }

  /** @param {AnitomyResult} param0 */
  export function sanitiseTerms ({ video_term: vid, audio_term: aud, video_resolution: resolution, file_name: fileName }) {
    const video = !Array.isArray(vid) ? [vid] : vid
    const audio = !Array.isArray(aud) ? [aud] : aud

    const terms = [...new Set([...video, ...audio].map(term => termMapping[term?.toUpperCase()]).filter(t => t))]
    if (resolution) terms.unshift({ text: resolution, color: '#c6ec58' })

    for (const key of Object.keys(termMapping)) {
      if (fileName && !terms.some(existingTerm => existingTerm.text === termMapping[key].text)) {
        if (!fileName.toLowerCase().includes(key.toLowerCase())) {
          if (matchPhrase(key.toLowerCase(), fileName, 1)) {
            terms.push(termMapping[key])
          }
        } else {
          terms.push(termMapping[key])
        }
      }
    }

    return [...terms]
  }

  /** @param {AnitomyResult} param0 */
  function simplifyFilename ({ video_term: vid, audio_term: aud, video_resolution: resolution, file_name: name, release_group: group, file_checksum: checksum }) {
    const video = !Array.isArray(vid) ? [vid] : vid
    const audio = !Array.isArray(aud) ? [aud] : aud

    let simpleName = name
    if (group) simpleName = simpleName.replace(group, '')
    if (resolution) simpleName = simpleName.replace(resolution, '')
    if (checksum) simpleName = simpleName.replace(checksum, '')
    for (const term of video) simpleName = simpleName.replace(term, '')
    for (const term of audio) simpleName = simpleName.replace(term, '')
    return simpleName.replace(/[[{(]\s*[\]})]/g, '').replace(/\s+/g, ' ').trim()
  }

  function copyToClipboard (text) {
    navigator.clipboard.writeText(text)
    toast('Copied to clipboard', {
      description: 'Copied magnet URL to clipboard',
      duration: 5000
    })
  }
</script>

<script>
  /** @type {Result & { parseObject: AnitomyResult }} */
  export let result

  /** @type {import('@/modules/al.d.ts').Media} */
  export let media

  /** @type {Function} */
  export let play
</script>

<div class='card bg-dark p-15 d-flex mx-0 overflow-hidden pointer mb-10 mt-0 position-relative scale' role='button' tabindex='0' use:click={() => play(result)} on:contextmenu|preventDefault={() => copyToClipboard(result.link)} title={result.parseObject.file_name}>
  {#if media.bannerImage || media.trailer?.id}
    <div class='position-absolute top-0 left-0 w-full h-full'>
      <object class='img-cover w-full h-full' data={media.bannerImage || (media.trailer?.id && `https://i.ytimg.com/vi/${media.trailer?.id}/maxresdefault.jpg`) || ' '}>
        <object class='img-cover w-full h-full' data={(media.trailer?.id && `https://i.ytimg.com/vi/${media.trailer?.id}/hqdefault.jpg`) || ' '}>
          <img class='img-cover w-full h-full' src={' '} alt='bannerImage'> <!-- trailer no longer exists... hide all images. -->
        </object>
      </object>
      <div class='position-absolute top-0 left-0 w-full h-full' style='background: var(--torrent-card-gradient)' />
    </div>
  {/if}
  <div class='d-flex pl-10 flex-column justify-content-between w-full h-auto position-relative' style='min-height: 10rem; min-width: 0;'>
    <div class='d-flex w-full'>
      <div class='font-size-22 font-weight-bold text-nowrap'>{result.parseObject?.release_group && result.parseObject.release_group.length < 20 ? result.parseObject.release_group : 'No Group'}</div>
      {#if result.type === 'batch'}
        <Database size='2.6rem' class='ml-auto' />
      {:else if result.verified}
        <BadgeCheck size='2.8rem' class='ml-auto' style='color: #53da33' />
      {/if}
    </div>
    <div class='py-5 font-size-14 text-muted text-truncate overflow-hidden'>{simplifyFilename(result.parseObject)}</div>
    <div class='metadata-container d-flex w-full align-items-start text-dark font-size-14' style='line-height: 1;'>
      <div class='primary-metadata py-5 d-flex flex-row'>
        <div class='text-light d-flex align-items-center text-nowrap'>{fastPrettyBytes(result.size)}</div>
        <div class='text-light d-flex align-items-center text-nowrap'>&nbsp;•&nbsp;</div>
        <div class='text-light d-flex align-items-center text-nowrap'>{result.seeders} Seeders</div>
        <div class='text-light d-flex align-items-center text-nowrap'>&nbsp;•&nbsp;</div>
        <div class='text-light d-flex align-items-center text-nowrap'>{since(new Date(result.date))}</div>
      </div>
      <div class='secondary-metadata d-flex flex-wrap ml-auto justify-content-end'>
        {#if result.type === 'best'}
          <div class='rounded px-15 py-5 ml-10 border text-nowrap font-weight-bold d-flex align-items-center' style='background: #1d2d1e; border-color: #53da33 !important; color: #53da33'>
            Best Release
          </div>
        {:else if result.type === 'alt'}
          <div class='rounded px-15 py-5 ml-10 border text-nowrap font-weight-bold d-flex align-items-center' style='background: #391d20; border-color: #c52d2d !important; color: #c52d2d'>
            Alt Release
          </div>
        {/if}
        {#each sanitiseTerms(result.parseObject) as { text }, index}
          <div class='rounded px-15 py-5 bg-very-dark text-nowrap text-white d-flex align-items-center' class:ml-10={index !== 0 } style='margin-top: 0.15rem;'>
            {text}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .scale {
    transition: transform 0.2s ease;
  }
  .scale:hover{
    transform: scale(1.04);
  }

  /* Behavior for narrow screens (mobile) */
  @media (max-width: 35rem) {
    .metadata-container {
      flex-direction: column !important;
    }
    .secondary-metadata {
      margin-left: 0 !important;
      justify-content: flex-start !important;
    }
  }
</style>
