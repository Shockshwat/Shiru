<script context='module'>
    import { readable } from 'simple-store-svelte'

    const mql = matchMedia('(min-width: 769px)')
    const isMobile = readable(!mql.matches, set => {
        const check = ({ matches }) => set(!matches)
        mql.addEventListener('change', check)
        return () => mql.removeEventListener('change', check)
    })
</script>

<script>
    import { cache, caches } from '@/modules/cache.js'

    export let active = false
    export let padding = '1rem'
    const tmppadding = padding
    $: resize = !$isMobile
    $: minwidth = $isMobile ? '25rem' : '35rem'
    $: maxwidth = $isMobile ? '25rem' : '120rem'
    $: width = !$isMobile ? (cache.getEntry(caches.GENERAL, 'widthMiniplayer') || '0px') : '0px'
    $: position = cache.getEntry(caches.GENERAL, 'posMiniplayer') || 'bottom right'
    $: if (!$isMobile) { cache.setEntry(caches.GENERAL, 'widthMiniplayer', width); cache.setEntry(caches.GENERAL, 'posMiniplayer', position) }
    let height = '0px'
    let left = '0px'
    let top = '0px'
    let container = null
    let dragging = false
    function draggable (node) {
        const initial = { x: 0, y: 0 }
        let timeout = null
        function dragStart (e) {
            clearTimeout(timeout)
            padding = '0rem'
            const { pointerId, offsetX, offsetY } = e
            const bounds = container.getBoundingClientRect()
            const relativeBounds = container.offsetParent.getBoundingClientRect()
            dragging = true
            position = ''
            initial.x = offsetX + relativeBounds.left
            initial.y = bounds.height - (e.target.clientHeight - offsetY) + relativeBounds.top
            width = bounds.width + 'px'
            height = bounds.height + 'px'
            handleDrag(e)
            document.body.addEventListener('touchmove', handleDrag)
            document.body.addEventListener('pointermove', handleDrag)
            if (pointerId) node.setPointerCapture(pointerId)
        }
        function dragEnd ({ pointerId, clientX, clientY, touches }) {
            dragging = false
            padding = tmppadding
            if (clientX == null) {
                clientX = left.slice(0, -2)
                clientY = top.slice(0, -2)
            }
            document.body.removeEventListener('touchmove', handleDrag)
            document.body.removeEventListener('pointermove', handleDrag)
            const istop = window.innerHeight / 2 - clientY >= 0
            const isleft = window.innerWidth / 2 - clientX >= 0
            top = istop ? '0px' : '100%'
            left = isleft ? '0px' : '100%'
            if (pointerId) node.releasePointerCapture(pointerId)
            timeout = setTimeout(() => {
                position += istop ? ' top' : ' bottom'
                position += isleft ? ' left' : ' right'
            }, 600)
        }
        function handleDrag ({ clientX, clientY, touches }) {
            if (clientX == null) {
                clientX = touches[0].clientX
                clientY = touches[0].clientY
            }
            left = clientX - initial.x + 'px'
            top = clientY - initial.y + 'px'
        }
        node.addEventListener('pointerdown', dragStart)
        node.addEventListener('pointerup', dragEnd)
        node.addEventListener('touchend', dragEnd)
    }

    /** TODO: Implement resize arrow on each corner based on miniplayer position. Currently it is always top left, which isn't very intuitive if the miniplayer is on the left side of the screen. */
    function resizable (node) {
        function resizeStart ({ pointerId }) {
            document.body.addEventListener('pointermove', handleResize)
            if (pointerId) node.setPointerCapture(pointerId)
        }
        function resizeEnd ({ pointerId }) {
            document.body.removeEventListener('pointermove', handleResize)
            if (pointerId) node.releasePointerCapture(pointerId)
        }
        function handleResize ({ movementX }) {
            width = width.slice(0, -2) - movementX + 'px'
        }
        node.addEventListener('pointerdown', resizeStart)
        node.addEventListener('pointerup', resizeEnd)
        node.addEventListener('touchend', resizeEnd)
    }
</script>
<div class='miniplayer-container {position} {$$restProps.class}'
     class:mt-20={active} class:active class:animate={!dragging} class:custompos={!position}
     style:--left={left} style:--top={top} style:--height={height} style:--width={width} style:--padding={padding} style:--maxwidth={maxwidth} style:--minwidth={minwidth}
     role='group' bind:this={container} on:dragstart|preventDefault|self>
    {#if resize && active}
        <div class='resize' use:resizable />
    {/if}
    <slot />
    <div class='miniplayer-footer' class:dragging use:draggable tabindex='-1'>::::</div>
</div>

<style>
    .resize {
        background: transparent;
        position: absolute;
        top: 0;
        left: 0;
        cursor: nw-resize;
        user-select: none;
        width: 1.5rem;
        height: 1.5rem;
        z-index: 100;
    }
    .active {
        position: absolute;
        width: clamp(var(--minwidth), var(--width), var(--maxwidth)) !important
    }
    .active.custompos {
        top: clamp(var(--padding), var(--top), 100% - var(--height) - var(--padding)) !important;
        left: clamp(var(--padding), var(--left), 100% - var(--width) - var(--padding)) !important;
    }
    .active.top {
        top: var(--padding) !important
    }
    .active.bottom {
        bottom: var(--padding) !important
    }
    .active.left {
        left: var(--padding) !important
    }
    .active.right {
        right: var(--padding) !important
    }
    .animate {
        transition-duration: 0.5s;
        transition-property: top, left;
        transition-timing-function: cubic-bezier(0.3, 1.5, 0.8, 1);
    }
    .miniplayer-footer {
        display: none;
        letter-spacing: .15rem;
        cursor: grab;
        font-weight: 600;
        user-select: none;
        padding-bottom: .2rem;
        text-align: center;
    }
    .dragging {
        cursor: grabbing !important;
    }
    .active > .miniplayer-footer {
        display: block !important;
    }
</style>
