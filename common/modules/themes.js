import { append, element } from 'svelte/internal'
import { writable } from 'simple-store-svelte'
import { cache, caches } from '@/modules/cache.js'

const style = element('style')
style.id = 'customThemes'
append(document.head, style)

export const variables = writable(cache.getEntry(caches.GENERAL, 'theme') || '')

variables.subscribe(value => {
  cache.setEntry(caches.GENERAL, 'theme', value)
  style.textContent = `:root{${value.replace(/{|}/g, '')}}`
})
