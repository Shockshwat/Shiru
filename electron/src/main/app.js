import { join } from 'node:path'
import process from 'node:process'

import { toXmlString } from 'powertoast'
import Jimp from 'jimp'
import fs from 'fs'

import { BrowserWindow, MessageChannelMain, Notification, Tray, Menu, nativeImage, app, dialog, ipcMain, powerMonitor, shell } from 'electron'
import electronShutdownHandler from '@paymoapp/electron-shutdown-handler'

import { development } from './util.js'
import Discord from './discord.js'
import Protocol from './protocol.js'
import Updater from './updater.js'
import Dialog from './dialog.js'
import store from './store.js'
import Debug from './debugger.js'

export default class App {
  webtorrentWindow = new BrowserWindow({
    show: development,
    webPreferences: {
      webSecurity: false,
      allowRunningInsecureContent: false,
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  })

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    frame: process.platform === 'darwin', // Only keep the native frame on Mac
    titleBarStyle: 'hidden',
    backgroundColor: '#17191c',
    autoHideMenuBar: true,
    webPreferences: {
      webSecurity: false,
      allowRunningInsecureContent: false,
      enableBlinkFeatures: 'FontAccess, AudioVideoTracks',
      backgroundThrottling: false,
      preload: join(__dirname, '/preload.js')
    },
    icon: join(__dirname, '/logo_filled.png'),
    show: false
  })

  discord = new Discord(this.mainWindow)
  protocol = new Protocol(this.mainWindow)
  updater = new Updater(this.mainWindow, this.webtorrentWindow)
  dialog = new Dialog(this.webtorrentWindow)
  tray = new Tray(join(__dirname, '/logo_filled.png'))
  cacheDir = join(app.getPath('userData'), 'Cache', 'Cache_Data')
  debug = new Debug()
  close = false
  notifications = {}

  constructor () {
    this.mainWindow.setMenuBarVisibility(false)
    this.mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.mainWindow.once('ready-to-show', () => this.mainWindow.show())
    this.mainWindow.on('minimize', () => this.mainWindow.webContents.postMessage('visibilitychange', 'hidden'))
    this.mainWindow.on('hide', () => this.mainWindow.webContents.postMessage('visibilitychange', 'hidden'))
    this.mainWindow.on('restore', () => this.mainWindow.webContents.postMessage('visibilitychange', 'visible'))
    this.mainWindow.on('show', () => this.mainWindow.webContents.postMessage('visibilitychange', 'visible'))
    ipcMain.on('torrent-devtools', () => this.webtorrentWindow.webContents.openDevTools())
    ipcMain.on('ui-devtools', ({ sender }) => sender.openDevTools())
    ipcMain.on('window-hide', () => this.mainWindow.hide())
    ipcMain.on('window-show', () => this.showAndFocus())

    this.mainWindow.on('closed', () => this.destroy())
    this.webtorrentWindow.on('closed', () => this.destroy())
    ipcMain.on('close', () => { this.close = true; this.destroy() })
    ipcMain.on('minimize', () => this.mainWindow?.minimize())
    ipcMain.on('maximize', () => {
      const focusedWindow = this.mainWindow
      focusedWindow?.isMaximized() ? focusedWindow.unmaximize() : focusedWindow.maximize()
    })

    this.mainWindow.on('close', (event) => {
      if (!this.close) {
        event.preventDefault()
        this.showAndFocus()
        this.mainWindow.webContents.send('window-close')
      }
    })

    app.on('before-quit', e => {
      if (this.destroyed) return
      e.preventDefault()
      this.destroy()
    })

    powerMonitor.on('shutdown', e => {
      if (this.destroyed) return
      e.preventDefault()
      this.destroy()
    })

    this.tray.setToolTip('Shiru')
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show', click: () => this.showAndFocus() },
      { label: 'Quit', click: () => { this.close = true; this.destroy() } }
    ]))
    this.tray.on('click', () => this.showAndFocus())
    ipcMain.on('notification', async (e, opts) => {
      opts.icon &&= await this.getImage(opts.icon)
      opts.heroImg &&= await this.getImage(opts.heroImg, true)
      opts.inlineImg &&= await this.getImage(opts.inlineImg)
      //const id = Symbol()
      const notification = new Notification({toastXml: toXmlString(opts) })
      notification.show()
    })

    if (process.platform === 'win32') {
      app.setAppUserModelId('com.github.rockinchaos.shiru')
      // this message usually fires in dev-mode from the parent process
      process.on('message', data => {
        if (data === 'graceful-exit') this.destroy()
      })
      electronShutdownHandler.setWindowHandle(this.mainWindow.getNativeWindowHandle())
      electronShutdownHandler.blockShutdown('Saving torrent data...')
      electronShutdownHandler.on('shutdown', async () => {
        await this.destroy()
        electronShutdownHandler.releaseShutdown()
      })
    } else {
      process.on('SIGTERM', () => this.destroy())
    }

    const torrentLoad = this.webtorrentWindow.loadURL(development ? 'http://localhost:5000/background.html' : `file://${join(__dirname, '/background.html')}`)
    this.mainWindow.loadURL(development ? 'http://localhost:5000/app.html' : `file://${join(__dirname, '/app.html')}`)

    if (development) {
      this.webtorrentWindow.webContents.openDevTools()
      this.mainWindow.webContents.openDevTools()
    }

    let crashcount = 0
    this.mainWindow.webContents.on('render-process-gone', async (e, { reason }) => {
      if (reason === 'crashed') {
        if (++crashcount > 10) {
          await dialog.showMessageBox({ message: 'Crashed too many times.', title: 'Shiru', detail: 'App crashed too many times. For a fix visit https://github.com/RockinChaos/Shiru/wiki/faq/', icon: '/renderer/public/logo_filled.png' })
          shell.openExternal('https://github.com/RockinChaos/Shiru/wiki/faq/')
        } else {
          app.relaunch()
        }
        app.quit()
      }
    })

    ipcMain.on('portRequest', async ({ sender }) => {
      const { port1, port2 } = new MessageChannelMain()
      await torrentLoad
      this.webtorrentWindow.webContents.postMessage('player', store.get('player'))
      this.webtorrentWindow.webContents.postMessage('torrentPath', store.get('torrentPath'))
      this.webtorrentWindow.webContents.postMessage('port', null, [port1])
      sender.postMessage('port', null, [port2])
    })

    ipcMain.on('webtorrent-reload', () => { if (!this.mainWindow?.isDestroyed() && !this.webtorrentWindow?.isDestroyed()) this.webtorrentWindow.webContents.postMessage('webtorrent-reload', null) })

    ipcMain.on('quit-and-install', () => {
      if (this.updater.hasUpdate) {
        this.destroy(true)
      }
    })
  }

  destroyed = false

  async destroy (forceRunAfter = false) {
    if (this.destroyed) return
    this.webtorrentWindow.webContents.postMessage('destroy', null)
    await new Promise(resolve => {
      ipcMain.once('destroyed', resolve)
      setTimeout(resolve, 5000).unref?.()
    })
    this.destroyed = true
    if (!this.updater.install(forceRunAfter)) app.quit()
  }

  async getImage(url, wideScreen) {
    const res = await fetch(url)
    const arrayBuffer = await res.arrayBuffer()
    const urlParts = url.split('/')
    const imagePath = join(this.cacheDir, urlParts[urlParts.length - 1])
    const image = await Jimp.read(Buffer.from(arrayBuffer))
    const { width, height } = image.bitmap
    if (wideScreen) {
      let adjWidth, adjHeight
      if (width / height > (16 / 9)) {
        adjWidth = Math.floor(height * (16 / 9))
        image.crop((width - adjWidth) / 2, 0, adjWidth, height)
      } else {
        adjHeight = Math.floor(width / (16 / 9))
        image.crop(0, (height - adjHeight) / 2, width, adjHeight)
      }
      await image.resize(adjWidth || width, adjHeight || height, Jimp.RESIZE_BEZIER).writeAsync(imagePath)
    } else {
      const squareRatio = Math.min(width, height)
      await image.crop((width - squareRatio) / 2, (height - squareRatio) / 2, squareRatio, squareRatio).resize(128, 128, Jimp.RESIZE_BEZIER).writeAsync(imagePath)
    }
    setTimeout(() => {
      fs.unlink(imagePath, (err) => {})
    }, 10000)
    return imagePath
  }

  showAndFocus () {
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore()
    } else if (!this.mainWindow.isVisible()) {
      this.mainWindow.show()
    } else {
      this.mainWindow.moveTop()
    }
    this.mainWindow.focus()
  }
}
