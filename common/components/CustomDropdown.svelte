<script>
    import { writable } from 'simple-store-svelte'
    import { click } from '@/modules/click.js'
    import { createListener } from '@/modules/util.js'

    export let id
    export let form = null
    export let value
    export let altValue = null
    export let options
    export let disabled = false

    function getOptions() {
        if (Array.isArray(options) && options.every(item => typeof item === 'string')) return options
        else if (typeof options === 'object' && options !== null) return Object.keys(options)
        throw new Error('Invalid list format')
    }

    function getOptionDisplay(option) {
        if (Array.isArray(options) && options.every(item => typeof item === 'string')) return option
        else if (typeof options === 'object' && options !== null) return options.hasOwnProperty(option) ? options[option] : null
    }

    const dropdown = writable(false)
    function createDropdownListener() {
        const { reactive, init } = createListener([`custom-menu-${id}`])
        init(true, true)
        reactive.subscribe(value => {
            if (!value) {
                dropdown.update(() => {
                    init(false, true)
                    searchTextInput = ''
                    return false
                })
            }
        })
    }

    let searchTextInput = ''
    function filterTags(event, trigger) {
        const inputValue = event.target.value
        let bestMatch = getOptions().find(item => getOptionDisplay(item)?.toLowerCase() === inputValue.toLowerCase())
        let found = false
        if ((trigger === 'keydown' && (event.key === 'Enter' || event.code === 'Enter')) || (trigger === 'input' && bestMatch)) {
            if (!bestMatch || inputValue.endsWith('*')) {
                bestMatch = (inputValue.endsWith('*') && inputValue.slice(0, -1)) || getOptions().find(item => getOptionDisplay(item)?.toLowerCase().startsWith(inputValue.toLowerCase())) || getOptions().find(item => getOptionDisplay(item)?.toLowerCase().endsWith(inputValue.toLowerCase()))
            }
            if (bestMatch && (!value || !value.includes(bestMatch))) {
                form?.dispatchEvent(new Event('input', { bubbles: true }))
                value = [...value, bestMatch]
                if (altValue) altValue = []
                searchTextInput = ''
                found = true
            } else if (bestMatch)  {
                const tagIndex = value?.indexOf(bestMatch)
                if (tagIndex > -1) {
                    value = [...value.slice(0, tagIndex), ...value.slice(tagIndex + 1)]
                    if (altValue) altValue = []
                    form?.dispatchEvent(new Event('input', { bubbles: true }))
                    searchTextInput = ''
                    found = true
                }
            }
        }
        if (!found && !(event.key === 'Tab' || event.code === 'Tab') && !dropdown.value) {
            dropdown.update(() => {
                createDropdownListener()
                searchTextInput = ''
                return true
            })
        }
    }

    function toggleDropdown() {
        dropdown.update(state => {
            if (!state) createDropdownListener()
            searchTextInput = ''
            return !state
        })
    }
</script>

<div class='custom-dropdown w-full'>
    <input
        id='search-{id}'
        type='search'
        class='form-control text-capitalize custom-menu-{id} no-bubbles'
        class:fix-border={!form}
        class:bg-dark={!form}
        class:bg-dark-light={form}
        disabled={disabled}
        class:not-reactive={disabled}
        autocomplete='off'
        bind:value={searchTextInput}
        on:keydown={(event) => filterTags(event, 'keydown')}
        on:input={(event) => filterTags(event, 'input')}
        use:click={() => toggleDropdown()}
        data-option='search'
        placeholder={(Array.isArray(value) && value.length ? value.map((v) => getOptionDisplay(v) || v) : []).concat(Array.isArray(altValue) && altValue.length ? altValue.map((v) => getOptionDisplay(v) || v) : []).join(', ') || 'Any'}
        list='sections-{id}'
    />
    {#if $dropdown}
        {@const searchInput = searchTextInput ? searchTextInput.toLowerCase() : null}
        <div class='custom-dropdown-menu position-absolute mh-300 overflow-y-auto w-full bg-dark custom-menu-{id}'>
            {#each getOptions().filter((val) => !searchInput || getOptionDisplay(val)?.toLowerCase().includes(searchInput)).sort((a, b) => ((value?.includes(a) ? -1 : 1) - (value?.includes(b) ? -1 : 1)) || ((altValue?.includes(a) ? 0 : 1) - (altValue?.includes(b) ? 0 : 1))).slice(0, 20) as option}
                <div class='custom-dropdown-item p-2 text-center pointer custom-menu-{id}' class:custom-dropdown-item-selected={value?.includes(option)} class:custom-dropdown-item-alt-selected={altValue?.includes(option)}
                     use:click={() => {
                         if (value.includes(option)) value = value.filter(item => item !== option)
                         else {
                             value = [...(Array.isArray(value) ? value : value ? [value] : []), option]
                             if (altValue) altValue = []
                         }
                         form?.dispatchEvent(new Event('input', { bubbles: true }))
                     }}
                     on:contextmenu={(event) => {
                         event.preventDefault()
                         if (altValue) {
                             if (altValue.includes(option)) altValue = altValue.filter(item => item !== option)
                             else {
                                 altValue = [...(Array.isArray(altValue) ? altValue : altValue ? [altValue] : []), option]
                                 value = []
                             }
                             form?.dispatchEvent(new Event('input', { bubbles: true }))
                         }
                     }}>
                    <span class='not-reactive'>{getOptionDisplay(option)}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .mh-300 {
        max-height: 30rem;
    }
    .fix-border {
        border-radius: 0 !important;
    }
    .custom-dropdown-menu {
        border-radius: 1rem;
        background-color: #212529;
        border: 0.1rem solid #444549;
        box-shadow: 0 0.25rem 0.75rem rgba(0, 0, 0, 0.1);
        z-index: 15;
    }
    .custom-dropdown-item:hover {
        background-color: #98c6fd;
        color: #000000;
    }
    .custom-dropdown-item-selected {
        background-color: #198ffd;
        color: #000000;
    }
    .custom-dropdown-item-alt-selected {
        background-color: #631420;
        color: #ffffff;
    }
</style>
