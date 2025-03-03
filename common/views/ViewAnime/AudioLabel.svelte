<script>
    import { settings } from '@/modules/settings.js'
    import { malDubs } from '@/modules/animedubs.js'
    import { animeSchedule } from '@/modules/animeschedule.js'
    import { getMediaMaxEp } from '@/modules/anime.js'
    import { writable } from 'svelte/store'
    import { Mic, MicOff, Captions, Adult } from 'lucide-svelte'

    /** @type {import('@/modules/al.d.ts').Media} */
    export let media = null
    export let data = null

    export let banner = false
    export let viewAnime = false
    export let smallCard = true
    export let episode = false
    let isDubbed = writable(false)
    let isPartial = writable(false)

    $: dubEpisodes = null
    animeSchedule.dubAiredLists.subscribe(value => getDubEpisodes(value))
    function getDubEpisodes(dubAiredLists) {
        if (!banner && !viewAnime) {
            const episodes = String(($isDubbed || $isPartial) && dubAiredLists?.filter(episode => episode.id === media.id)?.reduce((max, ep) => Math.max(max, ep.episode.aired), 0) || (dubAiredLists?.find(entry => entry.media?.media?.id === media.id)?.episodeNumber && '0') || (!$isPartial && media.status !== 'RELEASING' && media.status !== 'NOT_YET_RELEASED' && Number(media.seasonYear || 0) < 2025 && getMediaMaxEp(media)) || '')
            if (dubEpisodes !== episodes) dubEpisodes = episodes
        }
    }

    $: if (media) setLabel()
    function setLabel() {
        const dubLists = malDubs.dubLists.value
        if (media?.idMal && dubLists?.dubbed) {
            const episodeOrMedia = !episode || malDubs.isDubMedia(data?.parseObject)
            isDubbed.set(episodeOrMedia && dubLists.dubbed.includes(media.idMal))
            isPartial.set(episodeOrMedia && dubLists.incomplete.includes(media.idMal))
            getDubEpisodes(animeSchedule.dubAiredLists.value)
        }
    }
</script>
{#if settings.value.cardAudio}
    {#if !banner && !viewAnime}
        {@const subEpisodes = String(media.status !== 'NOT_YET_RELEASED' && media.status !== 'CANCELLED' && getMediaMaxEp(media, true) || dubEpisodes || '')}
        <div class='position-absolute bottom-0 right-0 d-flex h-2' class:mb-4={smallCard} class:mb-3={!smallCard}>
            {#if media.isAdult}
                <div class='pl-10 pr-15 text-dark font-weight-bold d-flex align-items-center h-full lg-slant adult mrl-2'>
                    <Adult size='2rem' strokeWidth='1.8' />
                </div>
            {/if}
            {#if $isDubbed || $isPartial}
                <div class='pl-10 pr-20 text-dark font-weight-bold d-flex align-items-center h-full slant' class:w-icon={!dubEpisodes || dubEpisodes.length === 0 || Number(dubEpisodes) === 0} class:w-text={dubEpisodes && dubEpisodes.length > 0 && Number(dubEpisodes) > 0} class:dubbed={$isDubbed} class:incomplete={$isPartial}>
                    <svelte:component this={$isDubbed ? Mic : MicOff} size='1.8rem' strokeWidth='2' />
                    <span class='d-flex align-items-center line-height-1 ml-2'><div class='line-height-1 mt-2'>{#if Number(dubEpisodes) > 0}{Number(dubEpisodes)}{/if}</div></span>
                </div>
            {/if}
            <div class='px-10 z-10 text-dark rounded-right font-weight-bold d-flex align-items-center h-full subbed slant mrl-1'>
                <Captions size='2rem' strokeWidth='1.5' />
                <span class='d-flex align-items-center line-height-1' class:ml-3={subEpisodes && subEpisodes.length > 0}><div class='line-height-1 mt-2'>{subEpisodes}</div></span>
            </div>
        </div>
    {:else if !viewAnime}
        {$isDubbed ? 'Dub' : $isPartial ? 'Partial Dub' : 'Sub'}
    {:else if viewAnime}
        <svelte:component this={$isDubbed ? Mic : $isPartial ? MicOff : Captions} class='mx-10' size='2.2rem' />
        <span class='mr-20'>{$isDubbed ? 'Dub' : $isPartial ? 'Partial Dub' : 'Sub'}</span>
    {/if}
{/if}

 <style>
     .w-icon {
         margin-right: -2rem !important;
     }
     .w-text {
         margin-right: -1.3rem !important;
     }
     .ml-2 {
         margin-left: 0.2rem;
     }
     .ml-3 {
         margin-left: 0.3rem;
     }
     .mrl-1 {
         margin-right: -.3rem !important;
     }
     .mrl-2 {
         margin-right: -1.3rem !important;
     }
     .mt-2 {
         margin-top: .2rem;
     }
     .mb-4 {
         margin-bottom: .38rem;
     }
     .mb-3 {
         margin-bottom: -.3rem !important;
     }
     .h-2 {
         height: 2rem;
     }
     .slant {
         clip-path: polygon(15% -1px, 100% 0, 100% 100%, 0% calc(100% + 1px));
     }
     .lg-slant {
         clip-path: polygon(21% -1px, 100% 0, 100% 100%, 0% calc(100% + 1px));
     }
     .adult {
         background-color: rgb(215, 6, 10) !important;
     }
     .dubbed {
         background-color: rgb(255, 214, 0) !important;
     }
     .subbed {
         background-color: rgb(137, 39, 255) !important;
     }
     .incomplete {
         background-color: rgb(255, 94, 0) !important;
     }
 </style>
