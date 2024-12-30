<p align="center">
	<a href="https://github.com/RockinChaos/Shiru">
		<img src="./web/static/logo_filled.svg" width="200">
	</a>
</p>
<h1 align="center"><b>Shiru</b></h1>

<h4 align="center"><b>Stream anime torrents, real-time with no waiting for downloads</b></h4>

<p align="center">
  <a href="https://github.com/RockinChaos/Shiru/wiki/about">About</a> •
  <a href="https://github.com/RockinChaos/Shiru/wiki/features/">Features</a> •
  <a href="https://github.com/RockinChaos/Shiru/wiki/faq/">Frequently Asked Questions</a> •
  <a href="#building-and-development">Building and Development</a> •
  <a href="https://github.com/RockinChaos/Shiru/releases/latest/">Download</a>
</p>
<p align="center">
  <!--<img src="./docs/out.gif" alt="showcase"><br>--> <!-- eventually record a new showcase -->
  <a href="https://discord.gg/D5FnJ7C">
    <img src="https://img.shields.io/discord/291764091239006208?style=flat-square" alt="chat">
  </a>
  <a href="https://github.com/RockinChaos/Shiru/releases/latest/">
    <img alt="GitHub all releases" src="https://img.shields.io/github/downloads/RockinChaos/Shiru/total?style=flat-square">
  </a>
</p>

## **About**
**Shiru** is a fork of [Miru](https://github.com/ThaUnknown/miru/) that is focused on providing a better feature rich experience with free mobile support. The overall goal was to implement features and design a similar experience to using a streaming website with functionality akin to MalSync and AniSkip.

This is a pure JS BitTorrent streaming environment, with a built-in list manager. Imagine qBit + Taiga + MPV, all in a single package, but streamed real-time. Completly ad free with no tracking/data collection.

This app is meant to feel look, work and perform like a streaming website/app, while providing all the advantages of torrenting, like file downloads, higher download speeds, better video quality and quicker releases.

Unlike qBit's sequential, seeking into undownloaded data will prioritise downloading that data, instead of flat out closing MPV.
## **Features**
### **Anime:**
- full AniList and MyAnimeList integration
  - filter anime by name, genre, season, year, format, status
  - view anime on your planning and watching list
  - add and remove anime from your planning list
  - automatically mark episodes as complete as you watch them
  - view trailers/previews for anime
  - score anime
  - view anime relations
- automatically find torrents for desired episodes
- automatically detect what anime a torrent is
- view latest releases on any custom RSS
- sub airing schedule
- dub airing schedule
- dub episode tracking
- sub and dub notifications
- find anime by image [just paste an image into the app]
### **Video:**
- full subtitle support
  - support for softcoded subtitles
  - support for external subtitle files
  - support for VTT, SSA, ASS, SUB, TXT subtitles
  - subtitle display in PiP
- keybinds for all functions:
  - **S** - seek forwards 90 seconds [skip opening]
  - **R** - seek backwards 90 seconds
  - **→** - seek forwards 2 seconds
  - **←** - seek backwards 2 seconds
  - **↑** - increase volume
  - **↓** - decrease volume
  - **M** - mute volume
  - **C** - cycle through subtitle tracks
  - **N** - play next episode [if available]
  - **B** - play last episode [if available]
  - **F** - toggle fullscreen
  - **P** - toggle picture in picture
  - **[** - increase playback speed
  - **]** - decrease playback speed
  - **\\** - reset playback speed to 1
  - **I** - view video stats for nerds
  - **`** - open keybinds UI
- editable keybinds **`** allows drag dropping any key
- miniplayer
- media session display
- media keys support
- Discord rich pressence
- preview thumbnails
- pause on lost focus
- autoplay next episode
- multi-audio support
- torrent download progress on the seek bar
### **Torrent:**
- select downloads folder
- specify download/upload speeds
- support for most popular BEP's
- support for custom torrent RSS feeds for latest releases
- change what resolution to find torrents in
- stream real-time with no waiting for downloads
- support for custom extensions for custom sources and trackers

## **Linux Installation**

### Arch

If you use paru:
```bash
paru -S shiru-bin
```

If you use yay:

```bash
yay -S shiru-bin
```

### Debian/Ubuntu

- Download the `linux-Shiru-version.deb` from the [releases](https://github.com/RockinChaos/Shiru/releases/latest) page.
- Install the deb file with package manager.
```bash
apt install linux-Shiru-*.deb
```

## **Building and Development**

Credit to [Migu](https://github.com/NoCrypt/migu) for doing the legwork on this.

### Requirements
- PNPM (or any package manager)
- NodeJS 20+
- Docker (with WSL support if you're on Windows)
- ADB
- Android Studio (SDK 34)
- Java 21 (JDK)

### Building for PC (Electron)
1. Navigate to the Electron directory:
   ```bash
   cd electron
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Development:
   ```bash
   pnpm start
   ```
4. Release:
   ```bash
   pnpm build
   ```

### Building for Android (Capacitor)
1. Navigate to the Capacitor directory:
   ```bash
   cd capacitor
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Check what's missing:
   ```bash
   pnpm exec cap doctor
   ```
4. (First time only) Build native code:
  - Windows:
    ```bash
    pnpm build:native-win
    ```
  - Linux:
    ```bash
    pnpm build:native
    ```
5. (Optional) Generate assets:
   ```bash
   pnpm build:assets
   ```
6. Open the Android project:
   ```bash
   pnpm exec cap open android
   ```
7. Connect your phone with ADB.
8. Development:
   ```bash
   pnpm dev:start
   ```
9. Release:
   ```bash
   pnpm build:app
   ```

## License

This project acknowledges and complies with the GPLv3 license.