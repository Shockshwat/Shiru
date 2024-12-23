import { Client } from 'discord-rpc'
import { ipcMain } from 'electron'
import { debounce } from '@/modules/util.js'

export default class Discord {
  defaultStatus = {
    activity: {
      timestamps: { start: Date.now() },
      details: 'Stream anime torrents',
      state: 'Watching anime',
      assets: {
        small_image: 'logo',
        small_text: 'https://github.com/RockinChaos/Shiru'
      },
      buttons: [
        {
          label: 'Download app',
          url: 'https://github.com/RockinChaos/Shiru/releases/latest'
        }
      ],
      instance: true,
      type: 3
    }
  }

  discord = new Client({ transport: 'ipc' })

  /** @type {string} */
  enableRPC = 'disabled'
  /** @type {Discord['defaultStatus'] | undefined} */
  cachedPresence

  /** @param {import('electron').BrowserWindow} window */
  constructor (window) {
    ipcMain.on('discord', (event, data) => {
      this.cachedPresence = data
      this.debouncedDiscordRPC(this.enableRPC === 'full' ? this.cachedPresence : undefined)
    })

    ipcMain.on('discord-rpc', (event, data) => {
      if (this.enableRPC !== data) {
        this.enableRPC = data
        if (data !== 'disabled' && !this.discord?.user) {
          this.loginRPC()
        } else {
          this.logoutRPC()
        }
      }
    })

    ipcMain.on('discord-hidden', () => {
      this.debouncedDiscordRPC(undefined, true)
    })

    this.discord.on('ready', async () => {
      this.setDiscordRPC(this.cachedPresence || this.defaultStatus)
      this.discord.subscribe('ACTIVITY_JOIN_REQUEST')
      this.discord.subscribe('ACTIVITY_JOIN')
      this.discord.subscribe('ACTIVITY_SPECTATE')
    })

    this.discord.on('ACTIVITY_JOIN', ({ secret }) => {
      window.webContents.send('w2glink', secret)
    })

    this.debouncedDiscordRPC = debounce((status, logout) => logout ? this.logoutRPC() : this.setDiscordRPC(status), 4500)
  }

  loginRPC () {
    this.discord.login({ clientId: '1301772260780019742' }).catch(() => {
      setTimeout(() => this.loginRPC(), 5000).unref()
    })
  }

  logoutRPC () {
    if (this.discord?.user) {
      setTimeout(() => this.discord.clearActivity(process.pid), 500).unref()
    }
  }

  setDiscordRPC (data = this.defaultStatus) {
    if (this.discord.user && data && this.enableRPC !== 'disabled') {
      data.pid = process.pid
      this.discord.request('SET_ACTIVITY', data)
    }
  }
}
