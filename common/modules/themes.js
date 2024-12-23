import { append, element } from 'svelte/internal'
import { writable } from 'simple-store-svelte'
import { cacheID } from '@/modules/settings.js'

const style = element('style')
style.id = 'customThemes'
append(document.head, style)

export const variables = writable(localStorage.getItem(`theme_${cacheID}`) || '')

variables.subscribe(value => {
  localStorage.setItem(`theme_${cacheID}`, value)
  style.textContent = `:root{${value.replace(/{|}/g, '')}}`
})
