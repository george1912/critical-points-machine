const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

const isDev = !app.isPackaged
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
const appFileUrl = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href

const isTrustedAppUrl = (url) => {
  try {
    const candidate = new URL(url)
    if (isDev) return candidate.origin === new URL(devServerUrl).origin
    return candidate.href === appFileUrl
  } catch {
    return false
  }
}

const openExternalUrl = (url) => {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return
    shell.openExternal(url).catch((error) => {
      console.error('Could not open external link:', error.message)
    })
  } catch {
    // Invalid URLs are denied; they are not passed to the operating system.
  }
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 980,
    height: 900,
    minWidth: 720,
    minHeight: 640,
    title: 'Critical Points Worksheet Filler',
    backgroundColor: '#f3f3f3',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppUrl(url)) return
    event.preventDefault()
    openExternalUrl(url)
  })

  if (isDev) {
    win.loadURL(devServerUrl)
  } else {
    win.loadURL(appFileUrl)
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
