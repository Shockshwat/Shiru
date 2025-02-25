import { autoUpdater } from 'electron-updater'
import { ipcMain, shell } from 'electron'

export default class Updater {
  hasUpdate = false
  downloading = false

  window
  torrentWindow
  destroyed

  /**
   * @param {import('electron').BrowserWindow} window
   * @param {import('electron').BrowserWindow} torrentWindow
   */
  constructor (window, torrentWindow) {
    this.window = window
    this.torrentWindow = torrentWindow
    ipcMain.on('update', () => {
      if (!this.downloading && !this.hasUpdate) autoUpdater.checkForUpdatesAndNotify()
      else autoUpdater.checkForUpdates()
    })
    autoUpdater.on('update-available', () => {
      if (!this.downloading) {
        this.downloading = true
        setInterval(() => { if (!this.hasUpdate && !this.destroyed) this.window.webContents.send('update-available', true) }, 1000)
      }
    })
    autoUpdater.on('update-downloaded', () => {
      if (!this.hasUpdate) {
        this.hasUpdate = true
        setInterval(() => { if (!this.destroyed) this.window.webContents.send('update-downloaded', true) }, 1000)
      }
    })
    autoUpdater.checkForUpdatesAndNotify()
  }

  install (forceRunAfter = false) {
    if (this.hasUpdate) {
      setImmediate(() => {
        try {
          this.window.close()
          this.torrentWindow.close()
        } catch (e) {}
        autoUpdater.quitAndInstall(true, forceRunAfter)
      })
      if (process.platform === 'darwin') shell.openExternal('https://github.com/RockinChaos/Shiru/releases/latest')
      this.hasUpdate = false
      return true
    }
  }
}