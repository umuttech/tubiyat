const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');

// --- OTA UPDATE CONFIG ---
const GITHUB_REPO = "umuttech/tubiyat";
const VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/version.json`;
const UPDATE_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes

let mainWindow;

function checkForUpdates() {
  https.get(VERSION_URL, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const remoteVersion = JSON.parse(data);
        const localVersionPath = path.join(__dirname, 'version.json');
        const localVersion = JSON.parse(fs.readFileSync(localVersionPath, 'utf8'));

        if (isNewerVersion(remoteVersion.version, localVersion.version)) {
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
// "Cloned" hatasını çözmek için veriyi saf bir nesne olarak burada tanımlıyoruz.
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

// --- 2. İLETİŞİM KÖPRÜSÜNÜ KURUYORUZ ---
// script.js "get-config" dediğinde bu fonksiyon çalışır ve veriyi yollar.
ipcMain.handle('get-config', () => {
  return configData;
});

// --- OTA AUTO-PATCHER HANDLER ---
ipcMain.handle('start-update', async () => {
  try {
    console.log("Starting background update...");

    // 1. Get the remote version.json again to get the file list
    const remoteVersionData = await fetchRemoteData(VERSION_URL);
    const remoteVersion = JSON.parse(remoteVersionData);
    const filesToUpdate = remoteVersion.files || ['index.html', 'script.js', 'style.css', 'version.json'];

    // 2. Download and replace each file
    for (const fileName of filesToUpdate) {
      const fileUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${fileName}`;
      const fileContent = await fetchRemoteData(fileUrl);
      const filePath = path.join(__dirname, fileName);

      // Write file (ensure dir exists if needed, though here they are in root)
      fs.writeFileSync(filePath, fileContent);
      console.log(`Updated: ${fileName}`);
    }

    console.log("All files updated successfully. Restarting...");

    // 3. Restart the app
    app.relaunch();
    app.exit(0);

    return { success: true };
  } catch (error) {
    console.error("Update failed:", error.message);
    return { success: false, error: error.message };
  }
});

// Helper to fetch data from HTTPS
function fetchRemoteData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
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
      // --- 3. KRİTİK AYARLAR (CORS HATASI İÇİN) ---
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // <--- Bu satır "CORS policy" hatasını çözer!
    }
  });

  mainWindow.loadFile('index.html');

  // Start update check
  setTimeout(checkForUpdates, 3000); // Check 3 seconds after launch
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

  // İsterseniz geliştirici konsolunu otomatik açmak için şu satırı aktif edin:
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
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