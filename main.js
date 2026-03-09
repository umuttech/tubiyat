const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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

function createWindow() {
  const win = new BrowserWindow({
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

  win.loadFile('index.html');

  // İsterseniz geliştirici konsolunu otomatik açmak için şu satırı aktif edin:
  // win.webContents.openDevTools();
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