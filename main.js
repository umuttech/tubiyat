const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');

// --- OTA UPDATE CONFIG ---
const GITHUB_REPO = "umuttech/novcsun";
const VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/version.json`;
const UPDATE_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes

let mainWindow;

const UPDATE_PATH = path.join(app.getPath('userData'), 'update');
const LOCAL_VERSION_PATH = path.join(__dirname, 'version.json');
const DOWNLOADED_VERSION_PATH = path.join(UPDATE_PATH, 'version.json');

function getActiveVersion() {
  try {
    if (fs.existsSync(DOWNLOADED_VERSION_PATH)) {
      return JSON.parse(fs.readFileSync(DOWNLOADED_VERSION_PATH, 'utf8'));
    }
  } catch (e) {
    console.error("Error reading downloaded version:", e.message);
  }
  return JSON.parse(fs.readFileSync(LOCAL_VERSION_PATH, 'utf8'));
}

function checkForUpdates() {
  https.get(VERSION_URL, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const remoteVersion = JSON.parse(data);
        const activeVersion = getActiveVersion();

        if (isNewerVersion(remoteVersion.version, activeVersion.version)) {
          console.log(`Update available: ${remoteVersion.version}`);
          if (mainWindow) {
            mainWindow.webContents.send('update-available', {
              version: remoteVersion.version,
              url: `https://github.com/${GITHUB_REPO}`
            });
          }
        }
      } catch (e) {
        console.error("Update check error:", e.message);
      }
    });
  }).on('error', (err) => {
    console.error("Update check network error:", err.message);
  });
}

function isNewerVersion(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
}

// --- 1. AYARLARI BURAYA SABİTLİYORUZ ---
const configData = {
  firebaseConfig: {
    apiKey: "AIzaSyAiybvG-Fa3wavK27CuuJfSdLJ6eKkMckc",
    authDomain: "ekmtal.firebaseapp.com",
    projectId: "ekmtal",
    storageBucket: "ekmtal.firebasestorage.app",
    messagingSenderId: "79453612898",
    appId: "1:79453612898:web:2eb3a73dfaba4065a01a3b",
    measurementId: "G-62TJ8YNCFS"
  },
  geminiApiKey: "AIzaSyBcL978S_LW-A4Wc54tFD5omQSlWIp8nIM"
};

function fetchRemoteData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch: ${res.statusCode}`));
      }
      let data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', (err) => reject(err));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  // Hot-load update if exists
  const updateIndexPath = path.join(UPDATE_PATH, 'index.html');
  if (fs.existsSync(updateIndexPath)) {
    console.log("Loading from Hot-Update directory:", updateIndexPath);
    mainWindow.loadFile(updateIndexPath);
  } else {
    mainWindow.loadFile('index.html');
  }

  setTimeout(checkForUpdates, 3000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
}

app.whenReady().then(() => {
  try {
    ipcMain.handle('get-config', () => {
      return configData;
    });

    ipcMain.handle('start-update', async () => {
      try {
        console.log("Starting background update to userData...");

        // Ensure update directory exists
        if (!fs.existsSync(UPDATE_PATH)) {
          fs.mkdirSync(UPDATE_PATH, { recursive: true });
        }

        const remoteVersionData = await fetchRemoteData(VERSION_URL);
        const remoteVersion = JSON.parse(remoteVersionData.toString());
        const filesToUpdate = remoteVersion.files || [
          'index.html', 'script.js', 'style.css', 'appConfig.js', 'version.json', 'changelog.json', 'about.txt',
          'images/dark.png', 'images/white.png', 'images/sakura.png', 'images/orman.png', 'images/sunrise.png',
          'sounds/arkaplan.mp3', 'sounds/dogru.mp3', 'sounds/geri_sayim.mp3', 'sounds/yanlis.mp3'
        ];

        const total = filesToUpdate.length;
        let completed = 0;

        for (const fileName of filesToUpdate) {
          const fileUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${fileName}`;
          const fileBuffer = await fetchRemoteData(fileUrl);
          const filePath = path.join(UPDATE_PATH, fileName);

          // Ensure subdirectory exists (e.g. images/, sounds/)
          const fileDir = path.dirname(filePath);
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }

          fs.writeFileSync(filePath, fileBuffer);
          completed++;
          console.log(`[${completed}/${total}] Updated: ${fileName}`);

          // Send progress to renderer
          if (mainWindow) {
            mainWindow.webContents.send('update-progress', {
              percent: Math.round((completed / total) * 100),
              file: fileName
            });
          }
        }

        console.log("All files updated in userData. Restarting...");
        app.relaunch();
        app.exit(0);

        return { success: true };
      } catch (error) {
        console.error("Update failed:", error.message);
        return { success: false, error: error.message };
      }
    });

  } catch (e) {
    console.error("IPC Registration Error:", e.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});