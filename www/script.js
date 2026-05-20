// Firebase kütüphanelerini import et
import { initializeApp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
    collection, onSnapshot, runTransaction, query, where,
    getDocs, writeBatch, enableIndexedDbPersistence // resetDatabase ve persistence için eklendi
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuration will be loaded via the preload script ---
let firebaseConfig;
let geminiApiKey;
let appId;

// Firebase başlatma
let app, db, auth;
let dbListener = () => { }; // boş fonksiyon
let currentUserId = null;
let isAuthReady = false;

// --- DOM Elementleri ---
let loginView, quizView, endView, medalWonView, explanationView, aboutView;
let countdownView;
let nameInput, loginButton;
let leaderboardContainer, aboutContent;
let questionNumber, questionText, answersContainer, timerContainer, scoreDisplay, quizProgress;
let endMessageText;
let menuSoundBtn, menuSoundIcon, menuSoundText;
let nameError;

// --- Settings & Theme DOM ---
let settingsButton, settingsMenu, themeModal, closeThemeModal, applyThemeBtn;
let menuAdminBtn, menuThemeBtn;
let themeCards;
let currentTheme = 'dark';

// --- Question Manager DOM ---
let questionManagerModal, closeQuestionManagerButton;
let qmCategorySelect, qmAddNewButton, qmListContainer, qmEditorContainer;
let qmInputQuestion, qmInputCorrect, qmInputWrong1, qmInputWrong2;
let qmCancelEditButton, qmSaveButton;
let qmEditIdInput, qmEditorTitle;
let qmBulkImportButton, bulkImportModal, closeBulkImportButton, cancelBulkImportButton, confirmBulkImportButton, bulkImportTextarea, bulkImportStatus;


// --- Test Değişkenleri ---
let allUsers = [];
let currentUserStats = {};
let currentQuizQuestions = [];
let currentQuestionIndex = 0;
let currentScore = 0; // Doğru cevap sayısı
let currentPoints = 0; // Toplam puan
let timerInterval = null;
let explainButton;
let nextQuestionTimeout = null;
let quizStartTime = 0;
let quizElapsedSeconds = 0;
let previousUserCorrectCount = 0; // Bir önceki kişinin doğru sayısı

// --- SES DEĞİŞKENLERİ ---
const correctSound = new Audio('sounds/dogru.mp3');
const wrongSound = new Audio('sounds/yanlis.mp3');
const countdownSound = new Audio('sounds/geri_sayim.mp3');
const backgroundMusic = new Audio('sounds/arkaplan.mp3');

backgroundMusic.loop = true;
backgroundMusic.volume = 0.3;


let isMuted = false; // Ses otomatik açık
let soundsLoaded = false;
let isGodMode = false; // ⚡ YÖNETİCİ GİRİŞİ YAPILDI MI? (Single Sign-On)




/**
 * Ana Ses Kontrol Fonksiyonu
 */
function toggleMute() {
    isMuted = !isMuted;

    if (!isMuted) {
        // --- SES AÇILIYOR ---
        if (menuSoundIcon) menuSoundIcon.textContent = '🔊';
        if (menuSoundText) menuSoundText.textContent = 'Sesi Kapat';

        if (!soundsLoaded) {
            console.log("Sesler ilk kez yükleniyor (warm-up)...");
            const audioElements = [correctSound, wrongSound, countdownSound, backgroundMusic];

            audioElements.forEach(audio => {
                try {
                    audio.load();
                    // Mobil cihazlar için sessiz bir "play-pause" yaparak kilidi açıyoruz (warm-up)
                    const playPromise = audio.play();
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            audio.pause();
                            audio.currentTime = 0;
                        }).catch(() => {
                            // İlk etkileşimden önce çalmaya izin verilmezse catch'e düşer, normaldir
                        });
                    }
                } catch (e) {
                    console.warn("Ses warm-up hatası:", e);
                }
            });
            soundsLoaded = true;
        }

        try {
            const playPromise = backgroundMusic.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn("Arka plan müziği çalma hatası:", error);
                });
            }
        } catch (e) {
            console.error("Arka plan müziği başlatılamadı:", e);
        }

    } else {
        // --- SES KAPATILIYOR ---
        if (menuSoundIcon) menuSoundIcon.textContent = '🔇';
        if (menuSoundText) menuSoundText.textContent = 'Sesi Aç';
        backgroundMusic.pause();
    }
}

function initBackgroundMusic() {
    const playMusic = () => {
        if (!soundsLoaded) {
            const audioElements = [correctSound, wrongSound, countdownSound, backgroundMusic];
            audioElements.forEach(audio => {
                try {
                    audio.load();
                } catch (e) { }
            });
            soundsLoaded = true;
        }
        backgroundMusic.play().catch(error => {
            console.warn("Autoplay engellendi, etkileşim bekleniyor:", error);
        });
    };

    playMusic();

    const onInteract = () => {
        playMusic();
        document.removeEventListener('click', onInteract);
        document.removeEventListener('keydown', onInteract);
        document.removeEventListener('touchstart', onInteract);
    };
    document.addEventListener('click', onInteract);
    document.addEventListener('keydown', onInteract);
    document.addEventListener('touchstart', onInteract);

    // --- BACKGROUND CONTROL (Mobil & Sekme Değişikliği) ---
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Arka plana geçtiğinde sesleri durdur
            if (backgroundMusic && !backgroundMusic.paused) {
                backgroundMusic.pause();
                backgroundMusic._wasPlaying = true;
            }
            if (countdownSound && !countdownSound.paused) {
                countdownSound.pause();
                countdownSound._wasPlaying = true;
            }

            // Quiz zamanlayıcısını durdur
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        } else {
            // Ön plana geldiğinde (sessiz değilse) sesleri devam ettir
            if (!isMuted) {
                if (backgroundMusic && backgroundMusic._wasPlaying) {
                    backgroundMusic.play().catch(() => { });
                    backgroundMusic._wasPlaying = false;
                }
                if (countdownSound && countdownSound._wasPlaying) {
                    countdownSound.play().catch(() => { });
                    countdownSound._wasPlaying = false;
                }
            }

            // Quiz zamanlayıcısını devam ettir (Eğer quiz devam ediyorsa)
            if (quizView && !quizView.classList.contains('hidden')) {
                startTimer(true);
            }
        }
    });
}

// --- SORU BANKASI (EDEBİYAT) ---
// --- SORU BANKASI (EDEBİYAT) ---
// --- DYNAMIC QUESTION BANKS (Loaded from Firestore) ---
let level1QuestionBank = [];
let level2QuestionBank = [];
let level3QuestionBank = [];
// Backup for migration (Original hardcoded data renamed and removed as it's now all dynamic from Firestore)

// --- ANA FONKSİYONLAR ---

/**
 * Sayfa yüklendiğinde çalışır, Firebase ve DOM'u başlat��r
 */
window.onload = async () => {
    // --- OFFLINE DETECTION ---
    // NOT: Offline detection artık SADECE index.html'deki inline script tarafından yönetiliyor.
    // Buradaki classList.add/remove('hidden') yaklaşımı inline style.display ile ÇAKIŞIYORDU
    // ve mobilde overlay'in düzgün gösterilmesini engelliyordu. Kaldırıldı.
    // Load the configuration from the main process
    // Load the configuration from the main process (Electron) or global scope (Mobile/Web)
    let config;
    try {
        if (window.api && window.api.getConfig) {
            config = await window.api.getConfig();
        } else if (window.appConfig) {
            config = window.appConfig;
        } else {
            console.error("Yapılandırma dosyası (config) bulunamadı!");
            // Fallback or alert user
            alert("Hata: Konfigürasyon yüklenemedi.");
            return;
        }
    } catch (configError) {
        console.error("Konfigürasyon yükleme hatası:", configError);
        alert("Hata: Konfigürasyon alınamadı (Electron IPC veya Ağ hatası).");
        return;
    }
    firebaseConfig = config.firebaseConfig;
    geminiApiKey = config.geminiApiKey;
    appId = firebaseConfig.projectId || 'default-quiz-app';

    // DOM elementlerini seç
    loginView = document.getElementById('loginView');
    quizView = document.getElementById('quizView');
    endView = document.getElementById('endView');
    medalWonView = document.getElementById('medalWonView');
    explanationView = document.getElementById('explanationView');
    countdownView = document.getElementById('countdownView');
    aboutView = document.getElementById('aboutView');
    aboutContent = document.getElementById('aboutContent');

    nameInput = document.getElementById('nameInput');
    nameError = document.getElementById('nameError');
    loginButton = document.getElementById('loginButton');
    leaderboardContainer = document.getElementById('leaderboardContainer');

    questionNumber = document.getElementById('questionNumber');
    questionText = document.getElementById('questionText');
    answersContainer = document.getElementById('answersContainer');
    timerContainer = document.getElementById('timerContainer');
    scoreDisplay = document.getElementById('scoreDisplay');
    quizProgress = document.getElementById('quizProgress');

    endMessageText = document.getElementById('endMessageText');
    explainButton = document.getElementById('explainButton');

    // Bottom Navigation Elements (New)
    const mobileBottomNav = document.getElementById('mobileBottomNav');
    const navItems = document.querySelectorAll('.nav-item');
    const leaderboardWrapper = document.getElementById('leaderboardWrapper');
    const desktopSettingsBtnWrapper = document.getElementById('desktopSettingsBtnWrapper');
    const homeGridContainer = document.getElementById('homeGridContainer');

    // Desktop/Mobile & OS detection
    // isElectron: Electron uygulaması kesin masaüstüdür — UA veya window.api ile tespit et
    const isElectron = navigator.userAgent.includes('Electron') || !!(window.api && window.api.getConfig);
    const isSmallScreen = window.innerWidth <= 768;
    const isMobileOS = !isElectron && (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (window.Capacitor && window.Capacitor.isNativePlatform())
    );
    const isDesktopOS = !isMobileOS;

    // Layout configuration based on screen size and OS
    // Always use Desktop layout if it's Electron, Desktop OS, OR large screen
    if (isElectron || isDesktopOS || !isSmallScreen) {
        if (mobileBottomNav) mobileBottomNav.classList.add('hidden');
        if (desktopSettingsBtnWrapper) desktopSettingsBtnWrapper.classList.remove('hidden');
        // Keep leaderboard visible and in its desktop place
        if (leaderboardWrapper) {
            leaderboardWrapper.classList.remove('full-page');
            leaderboardWrapper.classList.remove('hidden');
        }
    } else {
        // Mobile layout (Mobile OS + Small Screen)
        if (mobileBottomNav) {
            mobileBottomNav.classList.remove('hidden');
        }
        
        if (desktopSettingsBtnWrapper) desktopSettingsBtnWrapper.classList.add('hidden');
        
        if (leaderboardWrapper) {
            leaderboardWrapper.classList.add('full-page');
            leaderboardWrapper.classList.add('hidden'); // hidden initially on mobile layout
        }
    }

    // Load About txt
    fetch('about.txt')
        .then(response => {
            if (!response.ok) throw new Error("Could not read about.txt");
            return response.text();
        })
        .then(text => {
            if (aboutContent) aboutContent.textContent = text;
        })
        .catch(err => {
            console.warn("About text loading error:", err);
            if (aboutContent) aboutContent.textContent = "Hakkımızda içeriği yüklenemedi.";
        });

    // Tab Switching Logic
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            const isMobileView = window.innerWidth <= 768 || (window.Capacitor && window.Capacitor.isNativePlatform());

            console.log(`Sekme değiştiriliyor: ${target} (Mobil: ${isMobileView})`);

            // 1. Reset all nav items
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 2. Clear all views (handle parent/child carefully)
            if (aboutView) {
                aboutView.classList.add('hidden');
                aboutView.classList.remove('full-page');
            }
            if (settingsMenu) {
                settingsMenu.classList.add('hidden');
                settingsMenu.classList.remove('active');
                settingsMenu.classList.remove('full-page');
            }

            // 3. Show only the target view
            if (target === 'home') {
                if (homeGridContainer) homeGridContainer.classList.remove('hidden');
                if (loginView) loginView.classList.remove('hidden'); // Show login on home
                if (leaderboardWrapper) {
                    leaderboardWrapper.classList.remove('full-page');
                    // Desktop: leaderboard is side-by-side with home
                    if (!isMobileView) {
                        leaderboardWrapper.classList.remove('hidden');
                    } else {
                        leaderboardWrapper.classList.add('hidden'); // Hide on mobile home tab
                    }
                }
            } else if (target === 'leaderboard') {
                if (homeGridContainer) homeGridContainer.classList.remove('hidden'); // Parent must be visible
                if (loginView) loginView.classList.add('hidden'); // Hide login on leaderboard tab
                if (leaderboardWrapper) {
                    leaderboardWrapper.classList.remove('hidden');
                    if (isMobileView) leaderboardWrapper.classList.add('full-page');
                }
                if (typeof updateLeaderboard === 'function') updateLeaderboard();
            } else if (target === 'about') {
                if (homeGridContainer) homeGridContainer.classList.add('hidden');
                if (aboutView) {
                    aboutView.classList.remove('hidden');
                    if (isMobileView) aboutView.classList.add('full-page');
                }
            } else if (target === 'settings') {
                if (homeGridContainer) homeGridContainer.classList.add('hidden');
                if (settingsMenu) {
                    settingsMenu.classList.remove('hidden');
                    settingsMenu.classList.add('active');
                    if (isMobileView) settingsMenu.classList.add('full-page');
                }
            }
        });
    });

    // Sound Menu Items
    menuSoundBtn = document.getElementById('menuSoundBtn');
    menuSoundIcon = document.getElementById('menuSoundIcon');
    menuSoundText = document.getElementById('menuSoundText');

    // Settings & Theme DOM Elements
    settingsButton = document.getElementById('openQuestionManagerButton'); // Gear icon is now settings button
    settingsMenu = document.getElementById('settingsMenu');
    themeModal = document.getElementById('themeModal');
    closeThemeModal = document.getElementById('closeThemeModal');
    applyThemeBtn = document.getElementById('applyThemeBtn');
    menuAdminBtn = document.getElementById('menuAdminBtn');
    menuThemeBtn = document.getElementById('menuThemeBtn');
    themeCards = document.querySelectorAll('.theme-card');

    // Initialize Theme
    initTheme();

    // Settings Menu Event Listeners
    if (settingsButton) {
        settingsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (settingsMenu) {
                settingsMenu.classList.toggle('active');
                settingsMenu.classList.toggle('hidden');
                if (isMobileOS && isSmallScreen) {
                    settingsMenu.classList.toggle('full-page');
                }
            }
        });
    }

    document.addEventListener('click', (e) => {
        // Close settings menu if clicked outside
        if (settingsMenu && settingsMenu.classList.contains('active')) {
            const isMobile = window.innerWidth <= 768 || (window.Capacitor && window.Capacitor.isNativePlatform());
            if (isMobile) {
                // Mobilde sekmeler arasındayken dışarı tıklayınca kapanmasın
                return;
            }

            if (!e.target.closest('#settingsMenu') && !e.target.closest('#openQuestionManagerButton') && !e.target.closest('.theme-card') && !e.target.closest('#themeModal') && !e.target.closest('#adminPanelModal')) {
                settingsMenu.classList.remove('active');
                settingsMenu.classList.add('hidden');
                if (isMobile && homeGridContainer) homeGridContainer.classList.remove('hidden');
            }
        }
    });

    const menuAboutBtn = document.getElementById('menuAboutBtn');

    if (settingsMenu) settingsMenu.addEventListener('click', (e) => e.stopPropagation());

    menuAdminBtn.addEventListener('click', () => {
        // Ayarlar menüsünü bilerek kapatmıyoruz, modallar üst üste binecek.
        window.openAdminAuth();
    });

    if (menuAboutBtn) {
        menuAboutBtn.addEventListener('click', () => {
            const isMobile = window.innerWidth <= 768 || (window.Capacitor && window.Capacitor.isNativePlatform());
            if (isMobile) {
                // Mobilde sekmeler arası geçiş yap (mevcut tab mantığını tetikle)
                const aboutTab = document.querySelector('.nav-item[data-target="about"]');
                if (aboutTab) aboutTab.click();
            } else {
                if (settingsMenu) {
                    settingsMenu.classList.remove('active');
                    settingsMenu.classList.add('hidden');
                }
                if (aboutView) aboutView.classList.remove('hidden');
            }
        });
    }

    // Close About Modal Logic
    const closeAboutModal = () => {
        if (aboutView) aboutView.classList.add('hidden');
    };

    const closeAboutButton = document.getElementById('closeAboutButton');
    const applyAboutBtn = document.getElementById('applyAboutBtn');

    if (closeAboutButton) closeAboutButton.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAboutModal();
    });
    if (applyAboutBtn) applyAboutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAboutModal();
    });

    // Close on background click
    if (aboutView) {
        aboutView.addEventListener('click', (e) => {
            if (e.target === aboutView) {
                const isMobile = window.innerWidth <= 768 || (window.Capacitor && window.Capacitor.isNativePlatform());
                if (isMobile) {
                    // Mobilde arka plana tıklansa da kapanmasın (kalıcı sayfa gibi davranması için)
                    return;
                }
                closeAboutModal();
            }
        });
    }

    menuThemeBtn.addEventListener('click', () => {
        // Ayarlar menüsünü kapatmıyoruz, sadece tema modalını açıyoruz.
        if (themeModal) themeModal.classList.remove('hidden');
        // Mark active theme in modal
        themeCards.forEach(card => {
            if (card.getAttribute('data-theme') === currentTheme) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    });

    // Theme Modal Event Listeners
    closeThemeModal.addEventListener('click', () => {
        themeModal.classList.add('hidden');
    });

    themeCards.forEach(card => {
        card.addEventListener('click', () => {
            themeCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const selectedTheme = card.getAttribute('data-theme');
            applyTheme(selectedTheme, false); // Quick preview
        });
    });

    applyThemeBtn.addEventListener('click', () => {
        const activeCard = document.querySelector('.theme-card.active');
        if (activeCard) {
            const selectedTheme = activeCard.getAttribute('data-theme');
            applyTheme(selectedTheme, true); // Save
        }
        themeModal.classList.add('hidden');
    });

    // Question Manager DOM Elements
    questionManagerModal = document.getElementById('questionManagerModal');
    closeQuestionManagerButton = document.getElementById('closeQuestionManagerButton');
    qmCategorySelect = document.getElementById('qmCategorySelect');
    qmAddNewButton = document.getElementById('qmAddNewButton');
    qmListContainer = document.getElementById('qmListContainer');
    qmEditorContainer = document.getElementById('qmEditorContainer');
    qmInputQuestion = document.getElementById('qmInputQuestion');
    qmInputCorrect = document.getElementById('qmInputCorrect');
    qmInputWrong1 = document.getElementById('qmInputWrong1');
    qmInputWrong2 = document.getElementById('qmInputWrong2');


    // Admin Panel DOM
    const adminPanelModal = document.getElementById('adminPanelModal');
    const closeAdminPanelButton = document.getElementById('closeAdminPanelButton');
    const deleteUserListContainer = document.getElementById('deleteUserListContainer');

    qmInputWrong2 = document.getElementById('qmInputWrong2');
    qmCancelEditButton = document.getElementById('qmCancelEditButton');
    qmSaveButton = document.getElementById('qmSaveButton');
    qmEditIdInput = document.getElementById('qmEditId');
    qmEditorTitle = document.getElementById('qmEditorTitle');

    // Bulk Import DOM
    qmBulkImportButton = document.getElementById('qmBulkImportButton');
    bulkImportModal = document.getElementById('bulkImportModal');
    closeBulkImportButton = document.getElementById('closeBulkImportButton');
    cancelBulkImportButton = document.getElementById('cancelBulkImportButton');
    confirmBulkImportButton = document.getElementById('confirmBulkImportButton');
    bulkImportTextarea = document.getElementById('bulkImportTextarea');
    bulkImportStatus = document.getElementById('bulkImportStatus');

    // OS Detection for Bulk Import Button (Hide on Android/iOS, Show on Windows/Mac/Linux)
    // isMobileOS is already defined at the top of the function
    if (qmBulkImportButton) {
        if (!isMobileOS) {
            qmBulkImportButton.classList.remove('hidden');
            qmBulkImportButton.classList.add('flex');
        }
    }

    // Question Manager Event Listeners
    // openQuestionManagerButton.addEventListener('click', handleOpenQuestionManager); // REMOVED - Uses window.openAdminAuth now
    closeQuestionManagerButton.addEventListener('click', () => {
        questionManagerModal.classList.add('hidden');
    });
    qmCategorySelect.addEventListener('change', () => {
        loadQuestionsForManager(qmCategorySelect.value);
    });
    qmAddNewButton.addEventListener('click', openQuestionEditorForNew);
    qmCancelEditButton.addEventListener('click', () => {
        qmEditorContainer.classList.add('hidden');
        qmListContainer.classList.remove('hidden');
    });
    qmSaveButton.addEventListener('click', handleSaveQuestion);

    // Bulk Import Event Listeners
    qmBulkImportButton.addEventListener('click', () => {
        bulkImportModal.classList.remove('hidden');
        bulkImportTextarea.value = "";
        bulkImportStatus.classList.add('hidden');
    });
    closeBulkImportButton.addEventListener('click', () => bulkImportModal.classList.add('hidden'));
    cancelBulkImportButton.addEventListener('click', () => bulkImportModal.classList.add('hidden'));
    confirmBulkImportButton.addEventListener('click', handleBulkImport);

    // Ses açma/kapama butonu
    if (menuSoundBtn) menuSoundBtn.addEventListener('click', toggleMute);

    // --- SPLASH SCREEN LOGIC ---
    setTimeout(() => {
        const splashScreen = document.getElementById('splashScreen');
        if (splashScreen) {
            splashScreen.style.opacity = '0';
            setTimeout(() => {
                splashScreen.classList.add('hidden');
                checkWhatsNew(); // YENİ: Sürüm yenilikleri kontrolü
            }, 1000); // Wait for transition duration
        } else {
            checkWhatsNew();
        }
    }, 2000); // Show for 2 seconds

    // Giriş butonu veya Enter
    loginButton.addEventListener('click', handleLogin);
    nameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    });

    // Ana Menü butonu (tek seferlik listener — endQuiz içinde olmamalı)
    document.getElementById('tryAgainButton').addEventListener('click', () => {
        backgroundMusic.pause();
        backgroundMusic.currentTime = 0;
        nameInput.value = '';
        switchView('loginView');
    });
    nameInput.addEventListener('input', () => {
        nameError.classList.add('hidden');
        nameInput.classList.remove('border-red-500', 'border-2');
    });

    // explainButton ve explanationView dinleyicileri kaldırıldı

    // --- OTA UPDATE LISTENER (Electron) ---
    if (window.api && window.api.onUpdateAvailable) {
        window.api.onUpdateAvailable((data) => {
            // Electron main süreci bir güncelleme bulursa modalı aç
            showUpdateModal(data.version);
        });
    }

    // ✨ YENİ: Alt + 1 ile Veritabanı Sıfırlama Kısayolu (MODAL İLE GÜNCELLENDİ)
    // --- GENEL ŞİFRE MODAL YÖNETİMİ ---

    // Basitleştirilmiş Şifre Modalı Açma (Sadece Admin Panel için)
    window.openAdminAuth = function () {
        if (isGodMode) {
            // Zaten giriş yapılmışsa direkt paneli aç
            document.getElementById('adminPanelModal').classList.remove('hidden');
            return;
        }

        const passwordModal = document.getElementById('passwordModal');
        const passwordInput = document.getElementById('adminPasswordInput');
        const errorMsg = document.getElementById('resetErrorMsg');
        const titleEl = document.getElementById('passwordModalTitle');
        const descEl = document.getElementById('passwordModalDescription');
        const confirmBtn = document.getElementById('confirmResetButton');

        // UI Ayarla
        titleEl.textContent = "🛡️ YÖNETİCİ GİRİŞİ";
        titleEl.className = "text-xl font-bold text-blue-400 mb-4";
        descEl.textContent = "Yönetici paneline erişmek için şifreyi girin.";
        confirmBtn.className = "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition font-bold";
        confirmBtn.textContent = "Giriş Yap";

        passwordInput.value = '';
        errorMsg.classList.add('hidden');
        passwordModal.classList.remove('hidden');
        setTimeout(() => passwordInput.focus(), 100);
    };

    // Gear Button Click -> Open Auth
    // (openQuestionManagerButton is actually the Gear Icon)
    // REMOVED: Now handled by settingsButton listener above to open menu first

    // Alt + 1 Kısayolu (Direkt Auth aç)
    window.addEventListener('keydown', (event) => {
        if (event.altKey && event.key === '1') {
            event.preventDefault();
            window.openAdminAuth();
        }
    });

    // Şifre Onaylama Butonu
    document.getElementById('confirmResetButton').addEventListener('click', () => {
        const passwordInput = document.getElementById('adminPasswordInput');
        const password = passwordInput.value;
        const passwordModal = document.getElementById('passwordModal');
        const errorMsg = document.getElementById('resetErrorMsg');

        if (password === "ekmtal") {
            console.log("Şifre doğru. Yönetici modu açıldı.");
            isGodMode = true; // ⚡ GOD MODE ON
            passwordModal.classList.add('hidden');

            // Admin Panelini Aç
            document.getElementById('adminPanelModal').classList.remove('hidden');
        } else {
            errorMsg.textContent = "Hatalı şifre!";
            errorMsg.classList.remove('hidden');
            passwordInput.value = '';
            passwordInput.focus();
        }
    });

    document.getElementById('cancelResetButton').addEventListener('click', () => {
        document.getElementById('passwordModal').classList.add('hidden');
        nameInput.focus();
    });

    // Şifre inputunda Enter
    document.getElementById('adminPasswordInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('confirmResetButton').click();
        }
    });

    // --- ADMIN PANEL ACTIONS ---

    // 1. Paneli Kapat
    document.getElementById('closeAdminPanelButton').addEventListener('click', () => {
        document.getElementById('adminPanelModal').classList.add('hidden');
        isGodMode = false; // 🔒 Çıkış yapınca güvenliği geri aç
        nameInput.focus();
    });

    // 2. Soru Bankası Yönetimi
    document.getElementById('adminBtnAddQuestion').addEventListener('click', () => {
        // Direkt aç (Zaten yetki var)
        document.getElementById('adminPanelModal').classList.add('hidden'); // Paneli kapat
        questionManagerModal.classList.remove('hidden');
        loadQuestionsForManager('level1');
    });

    // 3. Veritabanı Sıfırla
    document.getElementById('adminBtnResetDB').addEventListener('click', () => {
        if (confirm("TÜM LİDERLİK TABLOSU SIFIRLANACAK! Emin misiniz?")) {
            resetDatabase();
        }
    });

    // 4. Kullanıcı Sil (Multi-Select Hazırlığı)
    document.getElementById('adminBtnDeleteUser').addEventListener('click', () => {
        const deleteModal = document.getElementById('deleteUserModal');
        const listContainer = document.getElementById('deleteUserListContainer');
        const errorMsg = document.getElementById('deleteUserErrorMsg');

        listContainer.innerHTML = ''; // Temizle

        if (allUsers.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500 text-center text-sm p-4">Kayıtlı kullanıcı yok.</p>';
        } else {
            allUsers.forEach(user => {
                const row = document.createElement('div');
                row.className = "flex items-center space-x-3 p-2 hover:bg-gray-700/50 rounded cursor-pointer";
                row.innerHTML = `
                    <input type="checkbox" value="${user.id}" id="user_del_${user.id}" class="w-5 h-5 rounded border-gray-600 text-red-600 focus:ring-red-500 bg-gray-700">
                    <label for="user_del_${user.id}" class="text-white cursor-pointer flex-1 font-mono text-sm">${user.name || user.id}</label>
                `;
                listContainer.appendChild(row);
            });
        }

        errorMsg.classList.add('hidden');
        deleteModal.classList.remove('hidden');
    });

    // --- Kullanıcı Silme Onayı (Multi-Select) ---
    // --- Kullanıcı Silme Onayı (Multi-Select) ---
    document.getElementById('confirmDeleteUserButton').addEventListener('click', async () => {
        const deleteModal = document.getElementById('deleteUserModal');
        const listContainer = document.getElementById('deleteUserListContainer');
        const errorMsg = document.getElementById('deleteUserErrorMsg');

        // Seçili checkboxları bul
        const selectedCheckboxes = listContainer.querySelectorAll('input[type="checkbox"]:checked');
        const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);

        if (selectedIds.length === 0) {
            errorMsg.textContent = "Lütfen en az bir kullanıcı seçin.";
            errorMsg.classList.remove('hidden');
            return;
        }

        if (!confirm(`${selectedIds.length} kullanıcı silinecek. Emin misiniz?`)) return;

        try {
            console.log("Silme işlemi başlatılıyor...", selectedIds);

            // Toplu silme (Parallel Promises)
            const deletePromises = selectedIds.map(async (userId) => {
                const userDocPath = `/artifacts/${appId}/public/data/quizUsers_v2/${userId}`;
                console.log(`Siliniyor: ${userId} -> ${userDocPath}`);
                try {
                    await deleteDoc(doc(db, userDocPath));
                    console.log(`✅ Başarıyla silindi: ${userId}`);
                } catch (innerError) {
                    console.error(`❌ Silinemedi: ${userId}`, innerError);
                    throw innerError; // Hata fırlat ki dıştaki catch yakalasın
                }
            });

            await Promise.all(deletePromises);

            console.log(`${selectedIds.length} kullanıcı başarıyla silindi.`);

            // Her iki modalı da kapat ve odağı giriş kutusuna ver
            deleteModal.classList.add('hidden');
            document.getElementById('adminPanelModal').classList.add('hidden');
            isGodMode = false; // Güvenliği geri aç
            setTimeout(() => nameInput.focus(), 100);

            // Kullanıcıya görsel geri bildirim
            alert("Seçilen kullanıcılar başarıyla silindi.");

        } catch (error) {
            console.error("Kullanıcılar silinirken hata:", error);
            errorMsg.textContent = "Hata: " + error.message;
            errorMsg.classList.remove('hidden');
            alert("Silme işlemi sırasında bir hata oluştu: " + error.message);
        }
    });

    document.getElementById('cancelDeleteUserButton').addEventListener('click', () => {
        document.getElementById('deleteUserModal').classList.add('hidden');
        document.getElementById('adminPanelModal').classList.add('hidden');
        isGodMode = false;
        setTimeout(() => nameInput.focus(), 100);
    });


    // Arka plan müziğini başlat
    initBackgroundMusic();

    // Firebase başlama
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);

        // 🚀 OFFLINE PERSISTENCE (Offline çalışmayı ve güvenilir silmeyi sağlar)
        try {
            await enableIndexedDbPersistence(db);
            console.log("Offline Persistence enabled!");
        } catch (err) {
            if (err.code == 'failed-precondition') {
                console.warn("Persistence failed: Multiple tabs open.");
            } else if (err.code == 'unimplemented') {
                console.warn("Persistence failed: Browser not supported.");
            }
        }

        auth = getAuth(app);
        await setupAuthListener();

        // 🚀 VERİ MİGRASYONU VE YÜKLEME 🚀
        // Önce mevcut soruları yüklemeye çalış, boşsa migrasyon yap
        await migrateAndLoadQuestions();

        // 🔄 VERSİYON KONTROLÜ
        await checkAppVersion();

    } catch (error) {
        console.error("Firebase başlatılırken hata oluştu:", error);
        leaderboardContainer.innerHTML = "<p class='text-red-400'>Veritabanına bağlanılamadı.</p>";
    }
};

/**
 * Temayı uygular ve opsiyonel olarak kaydeder
 */
function applyTheme(themeName, save = true) {
    const body = document.body;

    // Mevcut tema sınıflarını temizle
    const themeClasses = ['theme-dark', 'theme-light', 'theme-sakura', 'theme-forest', 'theme-sunrise'];
    body.classList.remove(...themeClasses);

    // Yeni temayı ekle
    body.classList.add(`theme-${themeName}`);
    currentTheme = themeName;

    if (save) {
        localStorage.setItem('tubiyat_theme', themeName);
    }

    console.log(`Tema uygulandı: ${themeName} (Kayıt: ${save})`);
}

/**
 * Başlangıçta kayıtlı temayı yükler
 */
function initTheme() {
    const savedTheme = localStorage.getItem('tubiyat_theme');
    if (savedTheme) {
        applyTheme(savedTheme, false);
    } else {
        applyTheme('dark', false); // Varsayılan koyu
    }
}

/**
 * Kimlik doğrulama aşaması
 */
async function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            isAuthReady = true;
            setupLeaderboardListener();
        } else {
            try {
                await signInAnonymously(auth);
                currentUserId = auth.currentUser.uid;
                isAuthReady = true;
                setupLeaderboardListener();
            } catch (e) {
                console.error("Anonim giriş hatası:", e);
                leaderboardContainer.innerHTML = "<p class='text-red-400'>Kimlik doğrulanamadı.</p>";
            }
        }
    });
}

/**
 * Liderlik tablosunu bekler
 */
function setupLeaderboardListener() {
    if (!db || !isAuthReady) {
        console.log("Liderlik tablosu için Auth bekleniyor...");
        return;
    }
    const usersCollectionPath = `/artifacts/${appId}/public/data/quizUsers_v2`;
    const q = query(collection(db, usersCollectionPath));

    dbListener = onSnapshot(q, (snapshot) => {
        allUsers = [];
        snapshot.forEach((doc) => {
            allUsers.push({ id: doc.id, ...doc.data() });
        });

        // 🧹 Geçersiz kullanıcıları otomatik temizle (tek kelimeli, rastgele isimler vs.)
        cleanupInvalidUsers(allUsers);

        updateLeaderboard();

    }, (error) => {
        console.error("Liderlik tablosu dinlenirken hata:", error);
        if (error.code === 'permission-denied') {
            leaderboardContainer.innerHTML = "<p class='text-red-400'>Veritabanı okuma izni hatası. Lütfen Firestore kurallarınızı kontrol edin (Test modu açık mı?).</p>";
        } else {
            leaderboardContainer.innerHTML = "<p class='text-red-400'>Liderlik tablosu yüklenemedi.</p>";
        }
    });
}

/**
 * Liderlik tablosu DOM'unu günceller
 */
/**
 * Liderlik tablosu DOM'unu günceller
 */
function updateLeaderboard() {
    if (!leaderboardContainer) return;

    // KOPYA ALARAK SIRALA (Puan ve Süre bazlı yeni sıralama)
    const sortedUsers = [...(allUsers || [])].sort((a, b) => {
        const scoreA = a.totalPoints || 0;
        const scoreB = b.totalPoints || 0;

        if (scoreB !== scoreA) {
            return scoreB - scoreA; // Birincil kriter: Puan (Azalan)
        }

        // İkincil kriter: Süre (Artan - daha kısa süre üstte)
        // Süresi olmayanları listenin sonuna atmak için büyük bir değer kullanıyoruz
        const timeA = (a.lastTime !== undefined && a.lastTime !== null) ? a.lastTime : 999999;
        const timeB = (b.lastTime !== undefined && b.lastTime !== null) ? b.lastTime : 999999;
        return timeA - timeB;
    });

    leaderboardContainer.innerHTML = "";

    if (sortedUsers.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-center text-secondary py-4';
        emptyMsg.textContent = "Henüz veri yok.";
        leaderboardContainer.appendChild(emptyMsg);
    }

    // Sadece ilk 30 kişiyi göster
    const topUsers = sortedUsers.slice(0, 30);

    topUsers.forEach((user, index) => {
        const rank = index + 1;
        const userRankTitle = getRankTitle(user.totalPoints || 0);
        const userRow = document.createElement('div');
        const isSelf = user.name === nameInput.value;
        userRow.className = `flex justify-between items-center p-3 rounded-md mb-2 transition-colors border ${isSelf ? 'bg-blue-500/20 border-blue-500' : 'bg-black/5 hover:bg-black/10 border-transparent'}`;

        userRow.innerHTML = `
            <div class='flex flex-col flex-1 min-w-0 mr-2'>
                <span class='font-bold text-primary truncate text-sm'>${rank}. ${user.name || 'Bilinmeyen'}</span>
                <span class='text-[10px] text-secondary uppercase tracking-widest truncate'>${userRankTitle}</span>
            </div>
            <div class='flex items-center space-x-2 text-xs font-mono text-primary shrink-0'>
                <div class="flex flex-col items-center w-8" title="Süre (Saniye)">
                    <span class="text-[9px] text-secondary">S</span>
                    <span>${user.lastTime !== undefined ? user.lastTime + 's' : '-'}</span>
                </div>
                <div class="flex flex-col items-center w-8">
                    <span class="text-[9px] text-secondary">D</span>
                    <span>${user.totalCorrect || 0}</span>
                </div>
                <div class="flex flex-col items-center w-8">
                    <span class="text-[9px] text-secondary">M</span>
                    <span>${user.medals || 0}</span>
                </div>
                <div class="flex flex-col items-center w-10">
                    <span class="text-[9px] text-yellow-600">P</span>
                    <span class="font-bold text-yellow-500">${user.totalPoints || 0}</span>
                </div>
            </div>
        `;
        leaderboardContainer.appendChild(userRow);
    });

    // Capacitor Updater onayını buraya ekliyoruz (UI yüklendiğinde garanti sinyal)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorUpdater) {
        window.Capacitor.Plugins.CapacitorUpdater.notifyAppReady()
            .then(() => console.log("OTA Onaylandı (Leaderboard)"))
            .catch(e => console.warn("OTA Onay Gecikti"));
    }
}

/**
 * Puanla Rütbe Hesaplama
 */
function getRankTitle(points) {
    if (points >= 100) return "👑 ÜSTAD";
    if (points >= 50) return "⚔️ USTA";
    if (points >= 10) return "⚒️ KALFA";
    return "🔨 ÇIRAK";
}

/**
 * İsim Normalizasyonu (Title Case)
 * Örn: "ahmet yilmaz" -> "Ahmet Yilmaz"
 */
function toTitleCase(str) {
    return str.toLocaleLowerCase('tr-TR').split(' ').map(word => {
        return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
    }).join(' ');
}

/**
 * Kapsamlı İsim Validasyonu
 * Rastgele isim girişini engellemek için sıkı kontroller uygular.
 * Geçerli ise null, değilse hata mesajı döndürür.
 */
function validateName(name) {
    // 1. Sadece Türkçe harfler ve boşluk (sayı/özel karakter kabul etme)
    const turkishLetterPattern = /^[a-zA-ZçÇğĞıİöÖşŞüÜ\s]+$/;
    if (!turkishLetterPattern.test(name)) {
        return "İsim sadece harflerden oluşmalıdır. Sayı veya özel karakter kullanılamaz.";
    }

    // 2. Fazla boşlukları temizle ve kelimelere ayır
    const words = name.replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0);

    // 3. En az 2 kelime olmalı (Ad + Soyad)
    if (words.length < 2) {
        return "Lütfen adınızı ve soyadınızı giriniz. (Örn: Umut Özgü)";
    }

    // 4. Her kelime en az 2 harf olmalı
    for (const word of words) {
        if (word.length < 2) {
            return "Her kelime en az 2 harften oluşmalıdır.";
        }
    }

    // 5. Toplam uzunluk en az 5 karakter
    const cleanName = words.join(' ');
    if (cleanName.length < 5) {
        return "İsim çok kısa. Lütfen geçerli bir ad ve soyad giriniz.";
    }

    // 6. Her kelimede en az 1 sesli harf olmalı
    const vowelPattern = /[aeıioöuüAEIİOÖUÜ]/;
    for (const word of words) {
        if (!vowelPattern.test(word)) {
            return `"${word}" geçerli bir kelime değil. Her kelimede en az bir sesli harf olmalıdır.`;
        }
    }

    // 7. Ardışık aynı harf kontrolü (4 veya daha fazla aynı harf kabul etme)
    // "Sümeyye" gibi 2 harfli tekrarlar normaldir. 4+ tekrar genelde rastgeledir.
    if (/(.)(\1{3,})/i.test(name)) {
        return "İsimde çok fazla ardışık aynı harf kullanılamaz. Lütfen geçerli bir isim giriniz.";
    }

    // 8. Çok fazla sessiz harf peş peşe (4+ sessiz harf yan yana → muhtemelen rastgele)
    const consonantStreak = /[bcçdfgğhjklmnprsştvyzBCÇDFGĞHJKLMNPRSŞTVYZ]{4,}/;
    if (consonantStreak.test(name.replace(/\s/g, ''))) {
        return "İsim okunabilir olmalıdır. Lütfen geçerli bir isim giriniz.";
    }

    return null; // Geçerli
}

/**
 * Veritabanındaki geçersiz (tek kelimeli veya rastgele) kullanıcıları otomatik temizler.
 * Her liderlik tablosu güncellemesinde çalışır.
 */
async function cleanupInvalidUsers(users) {
    if (!db || !isAuthReady) return;

    const invalidUsers = users.filter(user => {
        const name = (user.name || user.id || '').trim();
        // Geçersiz isim kontrolü (validateName mantığının basitleştirilmiş hali)
        const words = name.replace(/\s+/g, ' ').split(' ').filter(w => w.length > 0);
        if (words.length < 2) return true; // Tek kelime → geçersiz
        const turkishLetterPattern = /^[a-zA-ZçÇğĞıİöÖşŞüÜ\s]+$/;
        if (!turkishLetterPattern.test(name)) return true; // Harf dışı karakter → geçersiz
        if (name.length < 5) return true; // Çok kısa
        // Ardışık aynı harf
        if (/(.)(\1{3,})/i.test(name)) return true;
        return false;
    });

    if (invalidUsers.length === 0) return;

    console.warn(`🧹 ${invalidUsers.length} geçersiz kullanıcı bulundu, temizleniyor...`, invalidUsers.map(u => u.name || u.id));

    try {
        const batch = writeBatch(db);
        const usersCollectionPath = `/artifacts/${appId}/public/data/quizUsers_v2`;

        invalidUsers.forEach(user => {
            const userDocRef = doc(db, `${usersCollectionPath}/${user.id}`);
            batch.delete(userDocRef);
        });

        await batch.commit();
        console.log(`✅ ${invalidUsers.length} geçersiz kullanıcı silindi.`);
    } catch (error) {
        console.error("Geçersiz kullanıcılar temizlenirken hata:", error);
    }
}


/**
 * Giriş butonuna tıklandığında çalışır
 */
async function handleLogin() {
    let name = nameInput.value.trim();
    if (!name) {
        nameInput.classList.add('border-red-500', 'border-2');
        setTimeout(() => nameInput.classList.remove('border-red-500', 'border-2'), 2000);
        return;
    }

    // ✨ KAPSAMLI İSİM VALİDASYONU (Rastgele isim eklenmesini önler)
    const validationError = validateName(name);
    if (validationError) {
        nameError.textContent = validationError;
        nameError.classList.remove('hidden');
        nameInput.classList.add('border-red-500', 'border-2');
        nameInput.focus();
        return;
    }

    // ✨ YENİ: İsmi Normalize Et (Title Case)
    name = toTitleCase(name);
    nameInput.value = name; // Input'u da güncelle
    if (!name) {
        nameInput.classList.add('border-red-500', 'border-2');
        setTimeout(() => nameInput.classList.remove('border-red-500', 'border-2'), 2000);
        return;
    }

    if (!isAuthReady || !db) {
        console.error("Firebase henüz hazır değil.");
        return;
    }

    const userDocPath = `/artifacts/${appId}/public/data/quizUsers_v2/${name}`;
    const userDocRef = doc(db, userDocPath);

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userDocRef);

            if (!userDoc.exists()) {
                currentUserStats = {
                    name: name,
                    totalCorrect: 0,
                    totalPoints: 0,
                    medals: 0,
                    logins: 0, // Yeni kullanıcı 0 login ile başlar (bitirince 1 olacak)
                    seenQuestions: []
                };
                transaction.set(userDocRef, currentUserStats);
            } else {
                const data = userDoc.data();
                currentUserStats = {
                    ...data,
                    totalPoints: data.totalPoints || 0,
                    logins: data.logins || 0,
                    seenQuestions: data.seenQuestions || []
                };
                // Giriş sayısını burada artırmıyoruz, sadece bitişte artacak
                // transaction.update(userDocRef, { logins: currentUserStats.logins }); 
            }
        });

        startCountdown();

    } catch (error) {
        console.error("Kullanıcı girişi/kaydı sırasında hata:", error);
        if (error.code === 'permission-denied') {
            alert("Veritabanı yazma izni hatası! Firestore kurallarınızı 'Test Modu'na ayarladığınızdan emin olun.");
        }
    }
}

/**
 * Testi başlatır, soruları hazırlar
 */
function startQuiz() {
    currentQuizQuestions = [];
    currentQuestionIndex = 0;
    currentScore = 0;
    currentPoints = 0;

    let pool = [];

    // Helper: Filter out seen questions
    const filterSeen = (bank) => bank.filter(q => !currentUserStats.seenQuestions.includes(q.id));

    const buildPool = () => {
        const l1 = filterSeen(level1QuestionBank);
        const l2 = filterSeen(level2QuestionBank);
        const l3 = filterSeen(level3QuestionBank);

        return [
            ...shuffleArray(l1).slice(0, 3),
            ...shuffleArray(l2).slice(0, 4),
            ...shuffleArray(l3).slice(0, 3)
        ];
    };

    pool = buildPool();

    // Eğer gösterilecek soru kalmadıysa veya 10'dan az soru kaldıysa geçmişi sıfırlayıp başa dön
    if (pool.length < 10) {
        console.log("Yeterli soru kalmadı (10'dan az), soru geçmişi sıfırlanıyor...");
        currentUserStats.seenQuestions = [];
        pool = buildPool();
    }

    currentQuizQuestions = shuffleArray(pool);

    switchView('quizView');
    startTimer(); // Kronometreyi başlat
    showQuestion();
}

/**
 * Mevcut soruyu ekrana getirir ve sayacı başlatır
 */
function showQuestion() {
    // clearInterval kaldırıldı (Kronometre devam etmeli)

    // explainButton kaldırıldı
    explanationView.classList.add('hidden');

    if (nextQuestionTimeout) {
        clearTimeout(nextQuestionTimeout);
        nextQuestionTimeout = null;
    }

    if (currentQuestionIndex >= currentQuizQuestions.length) {
        endQuiz();
        return;
    }

    const q = currentQuizQuestions[currentQuestionIndex];

    const totalQuestions = currentQuizQuestions.length;
    const progressPercent = Math.round((currentQuestionIndex / totalQuestions) * 100);

    questionNumber.textContent = `${currentQuestionIndex + 1} / ${totalQuestions}`;
    scoreDisplay.textContent = `${currentPoints} P`;
    quizProgress.textContent = `%${progressPercent}`;

    questionText.textContent = q.q;

    const answers = shuffleArray([q.d, q.y1, q.y2]);

    answersContainer.innerHTML = "";

    answers.forEach(answer => {
        const button = document.createElement('button');
        button.textContent = answer;
        button.className = 'w-full text-left p-4 bg-black/10 border border-transparent rounded-lg transition-all duration-300 hover:bg-black/20 focus:outline-none focus:ring-2 focus:ring-blue-500 text-primary';
        button.onclick = () => handleAnswerClick(button, answer === q.d);
        answersContainer.appendChild(button);
    });
}

/**
 * Kronometre mantığı (00:00'dan yukarı sayar)
 */
function startTimer(isResume = false) {
    if (timerInterval) clearInterval(timerInterval);
    
    if (!isResume) quizStartTime = Date.now();
    
    timerInterval = setInterval(() => {
        quizElapsedSeconds = Math.floor((Date.now() - quizStartTime) / 1000);
        
        const minutes = Math.floor(quizElapsedSeconds / 60);
        const seconds = quizElapsedSeconds % 60;
        
        const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        const timerEl = document.getElementById('timer');
        if (timerEl) timerEl.textContent = display;
    }, 1000);
}

// Bonus puan bildirimleri ve eski süre bonusları kaldırıldı.

// handleTimeUp kaldırıldı (süre sınırı yok).


/**
 * Bir cevaba tıklandığında çalışır
 */
function handleAnswerClick(clickedButton, isCorrect) {
    // Kronometre durmuyor, sadece butonları kilitliyoruz.
    const allButtons = answersContainer.querySelectorAll('button');
    allButtons.forEach(btn => btn.disabled = true);

    const q = currentQuizQuestions[currentQuestionIndex];
    allButtons.forEach(btn => {
        if (btn.textContent === q.d) {
            btn.classList.remove('bg-black/10', 'bg-black/20', 'hover:bg-black/20', 'text-primary');
            btn.classList.add('bg-green-600', 'text-white', 'animate-pulse');
        }
    });

    const totalQuestions = currentQuizQuestions.length;
    const progressPercent = Math.round(((currentQuestionIndex + 1) / totalQuestions) * 100);
    quizProgress.textContent = `%${progressPercent}`;

    if (isCorrect) {
        playSound(correctSound);
        currentScore++; // Doğru cevap sayısı artmalı
        currentPoints = currentScore * 10;
        
        // Puan görsel olarak güncelleniyor
        scoreDisplay.textContent = `${currentPoints} P`;
        
        if (currentScore === 8) {
            medalWonView.classList.remove('hidden');
            launchSingleConfettiBurst();
            setTimeout(() => {
                medalWonView.classList.add('hidden');
                currentQuestionIndex++;
                showQuestion();
            }, 2500);
            return;
        }
    } else {
        playSound(wrongSound);
        clickedButton.classList.remove('bg-black/10', 'bg-black/20', 'hover:bg-black/20', 'text-primary');
        clickedButton.classList.add('bg-red-600', 'text-white');
    }

    setTimeout(() => {
        explainButton.classList.remove('hidden');
    }, 1000);

    nextQuestionTimeout = setTimeout(() => {
        currentQuestionIndex++;
        showQuestion();
    }, 2000);
}

/**
 * Test bittiğinde çalışır, sonuçları kaydeder
 */
async function endQuiz() {
    // Test Bitti İşlemleri
    clearInterval(timerInterval);
    
    // --- SKOR HESAPLAMA ---
    const temelPuan = currentScore * 10;
    
    currentPoints = temelPuan;
    
    // --- VERİTABANI GÜNCELLEME (Kümülati Değil, Son Deneme Bazlı) ---
    const userDocRef = doc(db, `/artifacts/${appId}/public/data/quizUsers_v2/${currentUserStats.name}`);
    
    // Puan ve Doğru sayısı artık her denemede sıfırdan güncelleniyor (Son deneme)
    const newTotalCorrect = currentScore;
    const newTotalPoints = currentPoints;
    const newMedals = (currentUserStats.medals || 0) + (currentScore >= 8 ? 1 : 0);
    
    const shownIds = currentQuizQuestions.map(q => q.id).filter(id => id);
    const updatedSeen = [...new Set([...(currentUserStats.seenQuestions || []), ...shownIds])];
    
    try {
        await updateDoc(userDocRef, {
            totalCorrect: newTotalCorrect,
            totalPoints: newTotalPoints,
            medals: newMedals,
            logins: (currentUserStats.logins || 0) + 1, // Sadece bitince girişi artır
            seenQuestions: updatedSeen,
            lastTime: quizElapsedSeconds,
            lastAttemptDate: new Date().toISOString() // İsteğe bağlı: Son deneme tarihi
        });
    } catch (e) { console.error("Skor kaydedilemedi:", e); }

    // --- BİTİŞ EKRANI GÜNCELLEME ---
    const minutes = Math.floor(quizElapsedSeconds / 60);
    const seconds = quizElapsedSeconds % 60;
    const timeDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const wrongCount = currentQuizQuestions.length - currentScore;

    // HTML'deki istatistik kartlarını doldur
    document.getElementById('endTimerText').textContent = timeDisplay;
    document.getElementById('endCorrectText').textContent = currentScore;
    document.getElementById('endWrongText').textContent = wrongCount;

    endMessageText.innerHTML = `
        <div class="animate-fadeIn">
            <p class="text-secondary text-lg mb-4">${currentUserStats.name}</p>
            <div class="my-6">
                <span class="text-secondary text-sm uppercase tracking-widest">Kazanılan Puan</span>
                <div class="text-6xl font-black text-yellow-500 mt-1">${currentPoints}</div>
            </div>
        </div>
    `;
    switchView('endView');
    launchConfettiFromCorners();

    // tryAgainButton listener artık window.onload içinde tek seferlik tanımlıdır.
}

/**
 * 3, 2, 1 Geri Sayımını Başlatır (SESLİ)
 */
function startCountdown() {
    const countdownText = document.getElementById('countdownText');

    switchView('countdownView');

    countdownText.textContent = "3";
    playSound(countdownSound);

    setTimeout(() => {
        countdownText.textContent = "2";
        playSound(countdownSound);
        setTimeout(() => {
            countdownText.textContent = "1";
            playSound(countdownSound);
            setTimeout(() => {
                startQuiz();
            }, 1000);
        }, 1000);
    }, 1000);
}

// --- ✨ GEMINI API YENİ FONKSİYONLARI ---

/**
 * 'Aıklama İste' butonuna tıklandığında çalışır
 */
async function showExplanation() {
    if (nextQuestionTimeout) {
        clearTimeout(nextQuestionTimeout);
        nextQuestionTimeout = null;
    }

    const q = currentQuizQuestions[currentQuestionIndex];
    const prompt = `Soru: "${q.q}"\nDoğru Cevap: "${q.d}"\n\nBu sorunun cevabı neden budur? Kısaca, eğitici bir dille ve Türkçe olarak açıkla.`;

    const explanationModal = document.getElementById('explanationView');
    const explanationContent = document.getElementById('explanationContent');
    const explanationLoading = document.getElementById('explanationLoading');

    explanationContent.innerHTML = "";
    explanationLoading.classList.remove('hidden');
    explanationModal.classList.remove('hidden');

    try {
        const responseText = await callGeminiAPI(prompt);
        explanationContent.innerHTML = responseText.replace(/\n/g, '<br>');
    } catch (error) {
        console.error("Gemini API hatası:", error);
        explanationContent.textContent = "Açıklama getirilirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.";
    } finally {
        explanationLoading.classList.add('hidden');
    }
}

/**
 * Gemini API'yi çağıran ana fonksiyon
 */
async function callGeminiAPI(prompt, retries = 3, delay = 1000) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const systemInstruction = {
        parts: [{ text: "Sen yardımsever bir edebiyat uzmanısın. Bir sorunun doğru cevabını, soruyu soran kişiye (TÜBİTAK projesindeki bir öğrenciye) yönelik, kısaca, eğitici ve teşvik edici bir dille, Türkçe olarak açıkla. Çok uzatma, 2-3 cümle yeterli." }]
    };

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: systemInstruction,
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            if (response.status === 429 && retries > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
                return callGeminiAPI(prompt, retries - 1, delay * 2);
            }
            throw new Error(`API error: ${response.statusText} (status: ${response.status})`);
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            return candidate.content.parts[0].text;
        } else {
            console.error("Gemini API'den beklenen formatta yanıt gelmedi:", result);
            throw new Error("API'den geçerli bir yanıt alınamadı.");
        }

    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return callGeminiAPI(prompt, retries - 1, delay * 2);
        } else {
            console.error("Gemini API'ye bağlanırken son denemede de hata oluştu:", error);
            throw error;
        }
    }
}


// --- YARDIMCI FONKSİYONLAR ---

/**
 * Hata yakalamalı güvenli ses çalma fonksiyonu (Efektler için)
 */
function playSound(audioElement) {
    // Ses kapalıysa hiçbir şey çalma
    if (isMuted) return;

    try {
        if (!audioElement.paused) {
            audioElement.pause();
        }
        audioElement.currentTime = 0; // Sesi başa sar
        const playPromise = audioElement.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn("Ses efekti oynatılamadı (muhtemelen kullanıcı etkileşimi bekleniyor):", error);
            });
        }
    } catch (e) {
        console.error("playSound hatası:", e);
    }
}

/**
 * Görünümler arası geçiş yapar (login, quiz, end)
 */
function switchView(viewId) {
    loginView.classList.add('hidden');
    quizView.classList.add('hidden');
    endView.classList.add('hidden');
    medalWonView.classList.add('hidden');
    explanationView.classList.add('hidden');
    countdownView.classList.add('hidden');
    const aboutView = document.getElementById('aboutView');
    if (aboutView) aboutView.classList.add('hidden');

    const leaderboardWrapper = document.getElementById('leaderboardWrapper');
    const homeGridContainer = document.getElementById('homeGridContainer');
    const settingsMenu = document.getElementById('settingsMenu');
    const mobileBottomNav = document.getElementById('mobileBottomNav');

    if (settingsMenu) settingsMenu.classList.add('hidden');
    if (homeGridContainer) homeGridContainer.classList.add('hidden');

    const isElectron = navigator.userAgent.includes('Electron') || !!(window.api && window.api.getConfig);
    const isMobileOS = !isElectron && (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (window.Capacitor && window.Capacitor.isNativePlatform())
    );
    const isMobile = isMobileOS && window.innerWidth <= 768;

    if (viewId === 'loginView') {
        if (homeGridContainer) homeGridContainer.classList.remove('hidden');
        document.getElementById(viewId).classList.remove('hidden');
        if (!isMobile && leaderboardWrapper) {
            leaderboardWrapper.classList.remove('hidden');
        } else if (leaderboardWrapper) {
            leaderboardWrapper.classList.add('hidden');
        }
        if (isMobile && mobileBottomNav) mobileBottomNav.classList.remove('hidden');
    } else {
        if (document.getElementById(viewId)) {
            document.getElementById(viewId).classList.remove('hidden');
        }
        if (leaderboardWrapper) leaderboardWrapper.classList.add('hidden');
        if (mobileBottomNav && ['countdownView', 'quizView', 'endView'].includes(viewId)) {
            mobileBottomNav.classList.add('hidden');
        }
    }
}

/**
 * Bir diziyi yerinde karıştırır (Fisher-Yates)
 */
function shuffleArray(array) {
    let m = array.length, t, i;
    while (m) {
        i = Math.floor(Math.random() * m--);
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }
    return array;
}

/**
 * Dört köşeden konfeti patlatır
 */
function launchConfettiFromCorners() {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);

        const particleCount = 50 * (timeLeft / duration);

        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0, 0.1), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.9, 1), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0, 0.1), y: randomInRange(0.9, 1) } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.9, 1), y: randomInRange(0.9, 1) } });
    }, 250);
}

/**
 * Madalya için ortadan tek bir konfeti patlatır
 */
function launchSingleConfettiBurst() {
    const duration = 2 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 40, spread: 360, ticks: 100, zIndex: 100, origin: { y: 0.6 } };

    confetti({ ...defaults, particleCount: 150, scalar: 1.2 });
    confetti({ ...defaults, particleCount: 100, scalar: 0.75 });
}

/**
 * (Sadece Geliştirici Konsolundan Çalıştırmak İçin)
 * Artık Alt+1 ile de tetiklenebilir.
 */
async function resetDatabase() {
    if (!db || !isAuthReady) {
        console.error("Veritabanı hazır değil. Lütfen bekleyin ve tekrar deneyin.");
        return;
    }

    console.warn("--- VERİTABANI SIFIRLAMA BAŞLATILDI ---");
    const usersCollectionPath = `/artifacts/${appId}/public/data/quizUsers_v2`;
    const usersCollection = collection(db, usersCollectionPath);

    try {
        const querySnapshot = await getDocs(usersCollection);

        if (querySnapshot.empty) {
            console.log("Veritabanı zaten boş.");
            return;
        }

        const batch = writeBatch(db);
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        console.log(`Başarıyla ${querySnapshot.size} kullanıcı silindi. Liderlik tablosu sıfırlandı.`);
        alert("Liderlik tablosu başarıyla sıfırlandı!");

    } catch (error) {
        console.error("Veritabanı sıfırlanırken bir hata oluştu:", error);
        alert("HATA: Veritabanı sıfırlanamadı. Lütfen konsolu kontrol edin.");
    }
}

/**
 * YÖNETİCİ ARACI: Veritabanındaki TÜM soruları siler.
 * Konsoldan çalıştırılır: window.deleteAllQuestions();
 */
window.deleteAllQuestions = async () => {
    if (!db || !isAuthReady) {
        console.error("Veritabanı hazır değil. Lütfen bekleyin.");
        return;
    }

    if (!confirm("DİKKAT: Veritabanındaki TÜM soruları silmek üzeresiniz. Bu işlem geri alınamaz! Devam etmek istiyor musunuz?")) {
        return;
    }

    if (!confirm("GERÇEKTEN tüm soruları silmek istiyor musunuz? (Son onay)")) {
        return;
    }

    console.warn("--- TÜM SORULAR SİLİNİYOR ---");
    const questionsCollectionPath = `/artifacts/${appId}/public/data/questions`;
    const questionsCollection = collection(db, questionsCollectionPath);

    try {
        const querySnapshot = await getDocs(questionsCollection);

        if (querySnapshot.empty) {
            console.log("Veritabanında silinecek soru bulunamadı.");
            alert("Veritabanı zaten boş.");
            return;
        }

        const batch = writeBatch(db);
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        // 🚀 CRITICAL: Mark migration as true even when deleting everything
        // to prevent the auto-migrator from re-seeding on next load.
        const configDocRef = doc(db, `/artifacts/${appId}/public/data/system/config`);
        await setDoc(configDocRef, { migration_done: true }, { merge: true });

        console.log(`Başarıyla ${querySnapshot.size} soru silindi.`);
        alert(`${querySnapshot.size} soru başarıyla silindi!`);

        // Yerel state'i güncelle
        await loadAllQuestionsFromDB();

        // Eğer Question Manager açıksa listeyi yenile
        if (typeof qmCategorySelect !== 'undefined' && qmCategorySelect.value) {
            loadQuestionsForManager(qmCategorySelect.value);
        }

    } catch (error) {
        console.error("Sorular silinirken bir hata oluştu:", error);
        alert("HATA: Sorular silinemedi. Lütfen konsolu kontrol edin.");
    }
};

// -------------------------------------------------------------------------
// 🆕 YENİLİKLER EKRANI (WHAT'S NEW) 🆕
// -------------------------------------------------------------------------

async function checkWhatsNew() {
    const LAST_SEEN_KEY = 'last_seen_changelog_version';
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);

    if (lastSeen !== APP_VERSION) {
        // Yeni bir sürüm varsa veya hiç girilmemişse
        const whatsNewModal = document.getElementById('whatsNewModal');
        const whatsNewContent = document.getElementById('whatsNewContent');
        const whatsNewVersion = document.getElementById('whatsNewVersion');
        const closeWhatsNewBtn = document.getElementById('closeWhatsNewBtn');

        if (!whatsNewModal) return;

        whatsNewVersion.textContent = 'v' + APP_VERSION;
        whatsNewModal.classList.remove('hidden');

        try {
            // file:// protokolünde fetch çalışmayacağı için (veya hata verebileceği için) her zaman sunucudan güncel changelog'u çek
            const changelogUrl = "https://raw.githubusercontent.com/umuttech/novcsun/main/changelog.json?t=" + Date.now();
            const response = await fetch(changelogUrl, { cache: "no-store" });
            if (!response.ok) throw new Error("Changelog fetch error");
            const changelogData = await response.json();

            let targetNotes = changelogData[APP_VERSION];
            if (!targetNotes) {
                whatsNewContent.innerHTML = `<p class="text-secondary text-center p-4">Genel geliştirmeler ve kararlılık düzeltmeleri yapıldı.</p>`;
            } else {
                whatsNewContent.innerHTML = targetNotes.map(note =>
                    `<div class="flex items-start gap-3 bg-black/20 p-3 rounded-lg border border-gray-700/50">
                        <span class="text-green-400 mt-0.5">✅</span>
                        <p class="text-sm text-gray-300 leading-relaxed">${note}</p>
                    </div>`
                ).join('');
            }
        } catch (e) {
            console.error("Yenilikler yüklenemedi:", e);
            whatsNewContent.innerHTML = `<p class="text-secondary text-center p-4">Genel geliştirmeler ve kararlılık düzeltmeleri yapıldı.</p>`;
        }

        closeWhatsNewBtn.onclick = () => {
            whatsNewModal.classList.add('hidden');
            localStorage.setItem(LAST_SEEN_KEY, APP_VERSION);
        };
    }
}

// -------------------------------------------------------------------------
// 🔄 UPDATE NOTIFICATION SYSTEM 🔄
// -------------------------------------------------------------------------

const APP_VERSION = "3.2.9"; // ✨ BU SÜRÜMÜ GÜNCELLEMEYİ UNUTMAYIN

async function checkAppVersion() {
    console.log("Sürüm kontrolü yapılıyor...", APP_VERSION);

    // GitHub'dan en güncel versiyon bilgisini çek
    const GITHUB_VERSION_URL = "https://raw.githubusercontent.com/umuttech/novcsun/main/version.json?t=" + new Date().getTime();

    try {
        const response = await fetch(GITHUB_VERSION_URL, { cache: 'no-store' }); // Önbelleği önlemek için
        if (!response.ok) throw new Error("GitHub versiyon dosyası alınamadı");

        const data = await response.json();
        const serverVersion = data.version;

        console.log(`Sunucu Sürümü: ${serverVersion}, Yerel Sürüm: ${APP_VERSION}`);

        // Sadece sunucu sürümü yerel sürümden daha YENİ ise güncelleme uyarısı ver
        if (isNewerVersion(serverVersion, APP_VERSION)) {
            console.warn("Yeni bir sürüm mevcut. Güncelleme denetleniyor...");
            showUpdateModal(serverVersion);
        }
    } catch (e) {
        console.error("Versiyon kontrolü hatası:", e);
    }
}

function isNewerVersion(remote, local) {
    if (!remote || !local) return false;
    const r = remote.split('.').map(Number);
    const l = local.split('.').map(Number);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
        const rv = r[i] || 0;
        const lv = l[i] || 0;
        if (rv > lv) return true;
        if (rv < lv) return false;
    }
    return false;
}

function showUpdateModal(newVersion) {
    const modal = document.getElementById('updateModal');
    if (!modal) return;

    // Reset progress bar state
    const progressContainer = document.getElementById('updateProgressContainer');
    const progressBar = document.getElementById('updateProgressBar');
    const progressText = document.getElementById('updateProgressText');
    if (progressContainer) progressContainer.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '%0';

    const linkBtn = document.getElementById('updateLink');
    linkBtn.innerHTML = '<span>🚀</span> Güncellemeyi İndir';
    linkBtn.style.pointerEvents = 'auto';
    linkBtn.style.opacity = '1';

    linkBtn.onclick = async (e) => {
        e.preventDefault();
        linkBtn.style.pointerEvents = 'none';
        linkBtn.style.opacity = '0.5';

        // --- DESKTOP (Electron) ---
        if (window.api && window.api.startUpdate) {
            // Show progress bar for desktop
            if (progressContainer) progressContainer.classList.remove('hidden');
            linkBtn.innerHTML = '<span>🔄</span> Güncelleniyor...';

            // Listen for progress events from main process
            if (window.api.onUpdateProgress) {
                window.api.onUpdateProgress((data) => {
                    const pct = Math.round(data.percent);
                    if (progressBar) progressBar.style.width = pct + '%';
                    if (progressText) progressText.textContent = '%' + pct;
                });
            } else {
                // Simulate progress if no IPC progress events
                let fakeProgress = 0;
                const fakeInterval = setInterval(() => {
                    fakeProgress = Math.min(fakeProgress + Math.random() * 8, 90);
                    if (progressBar) progressBar.style.width = Math.round(fakeProgress) + '%';
                    if (progressText) progressText.textContent = '%' + Math.round(fakeProgress);
                }, 400);
                window._updateFakeInterval = fakeInterval;
            }

            try {
                const result = await window.api.startUpdate();
                if (window._updateFakeInterval) clearInterval(window._updateFakeInterval);
                if (result && !result.success) {
                    throw new Error(result.error);
                }
                // Show 100% before restart
                if (progressBar) progressBar.style.width = '100%';
                if (progressText) progressText.textContent = '%100';
            } catch (err) {
                if (window._updateFakeInterval) clearInterval(window._updateFakeInterval);
                console.error('Desktop update error:', err);
                alert('Güncelleme başarısız: ' + (err.message || err));
                if (progressContainer) progressContainer.classList.add('hidden');
                linkBtn.innerHTML = '<span>⚠️</span> Tekrar Dene';
                linkBtn.style.pointerEvents = 'auto';
                linkBtn.style.opacity = '1';
            }
        }
        // --- MOBILE (Capacitor) ---
        else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorUpdater) {
            if (progressContainer) progressContainer.classList.remove('hidden');
            linkBtn.innerHTML = '<span>🔄</span> İndiriliyor...';

            try {
                const { CapacitorUpdater } = window.Capacitor.Plugins;
                // GitHub Releases URL formatı (raw değil releases kullan)
                const updateUrl = `https://github.com/umuttech/novcsun/releases/download/v${newVersion}/bundle.zip?t=` + new Date().getTime();

                // CapacitorUpdater download event ile ilerleme takibi
                const progressListener = await CapacitorUpdater.addListener('download', (info) => {
                    const pct = Math.round(info.percent);
                    if (progressBar) progressBar.style.width = pct + '%';
                    if (progressText) progressText.textContent = '%' + pct;
                });

                const update = await CapacitorUpdater.download({
                    url: updateUrl,
                    version: newVersion
                });

                progressListener.remove();

                // %100 göster ve yükle
                if (progressBar) progressBar.style.width = '100%';
                if (progressText) progressText.textContent = '%100';

                setTimeout(async () => {
                    await CapacitorUpdater.set({ id: update.id });
                }, 500);

            } catch (error) {
                console.error('Mobil güncelleme hatası:', error);
                const errorMsg = error.message || 'Bilinmeyen hata';
                alert(`Mobil güncelleme başarısız!\n\nHata: ${errorMsg}\n\nLütfen internet bağlantınızı kontrol edin veya manuel olarak güncelleyin.`);
                if (progressContainer) progressContainer.classList.add('hidden');
                linkBtn.innerHTML = '<span>⚠️</span> Tekrar Dene';
                linkBtn.style.pointerEvents = 'auto';
                linkBtn.style.opacity = '1';
            }
        } else {
            // PWA/Web — GitHub Release sayfasına yönlendir
            window.open(`https://github.com/umuttech/novcsun/releases/tag/v${newVersion}`, '_blank');
        }
    };

    modal.classList.remove('hidden');
}

/**
 * YÖNETİCİ ARACI: Sunucu sürümünü güncellemek için konsoldan kullanılır.
 * Kullanım: adminSetVersion("1.0.1", "https://link.com");
 */
window.adminSetVersion = async (version, url = "#") => {
    if (!db) {
        console.error("Veritabanı bağlantısı yok!");
        return;
    }
    const configDocRef = doc(db, `/artifacts/${appId}/public/data/system/config`);
    try {
        await setDoc(configDocRef, {
            latest_version: version,
            download_url: url,
            force_update: true
        }, { merge: true });
        console.log(`✅ BAŞARILI: Sunucu sürümü '${version}' olarak ayarlandı.`);
        alert(`Sunucu sürümü başarıyla ${version} yapıldı!`);
    } catch (e) {
        console.error("Versiyon ayarlama hatası:", e);
    }
};

// -------------------------------------------------------------------------
// 🚀 DYNAMIC QUESTION SYSTEM & MIGRATION 🚀
// -------------------------------------------------------------------------

/**
 * Checks if Firestore has questions. If not, migrates local questions.
 * Then loads all questions into memory variables.
 */
async function migrateAndLoadQuestions() {
    console.log("Sorular yükleniyor/kontrol ediliyor...");

    const categories = ['level1', 'level2', 'level3'];

    const usersCollectionPath = `/artifacts/${appId}/public/data/questions`;
    const qCol = collection(db, usersCollectionPath);

    try {
        const snapshot = await getDocs(qCol);

        if (snapshot.empty) {
            console.warn("DİKKAT: Veritabanında hiçbir soru bulunamadı! Lütfen Yönetici Paneli üzerinden soru ekleyin.");
            // If empty, we should ideally migrate initial questions here.
            // For now, just load from DB (which will be empty)
            await loadAllQuestionsFromDB();
        } else {
            console.log(`Veritabanında ${snapshot.size} soru bulundu.`);
            await loadAllQuestionsFromDB();
        }
    } catch (e) {
        console.error("Sorular veritabanından okunurken hata oluştu:", e);
    }
}

/**
 * Loads all questions from Firestore and distributes them into memory arrays
 */
async function loadAllQuestionsFromDB() {
    const usersCollectionPath = `/artifacts/${appId}/public/data/questions`;
    const qCol = collection(db, usersCollectionPath);
    const snapshot = await getDocs(qCol);

    // Reset arrays
    level1QuestionBank = [];
    level2QuestionBank = [];
    level3QuestionBank = [];

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const qObj = { id: docSnap.id, ...data }; // Use Firestore ID as ID

        // Sort into arrays
        switch (data.category) {
            case 'easy':
            case 'medium':
            case 'hard':
            case 'level1':
                level1QuestionBank.push(qObj); break;
            case 'level2': level2QuestionBank.push(qObj); break;
            case 'level3': level3QuestionBank.push(qObj); break;
            default: level1QuestionBank.push(qObj); // Fallback
        }
    });

    console.log("Sorular yüklendi:", {
        level1: level1QuestionBank.length,
        l2: level2QuestionBank.length,
        l3: level3QuestionBank.length
    });
}


/**
 * Opens Question Manager with password check (via Modal)
 */
function handleOpenQuestionManager() {
    if (window.openPasswordModal) {
        window.openPasswordModal('OPEN_MANAGER');
    } else {
        console.error("openPasswordModal fonksiyonu yüklenmedi!");
        alert("Sistem yüklenirken bir sorun oluştu.");
    }
}

/**
 * Loads questions into the manager list
 */
async function loadQuestionsForManager(category) {
    qmListContainer.innerHTML = '<div class="text-center text-gray-400 mt-10">Yükleniyor...</div>';

    // Use the memory arrays since they are synced (or re-fetch if we want real-time accuracy)
    // For simplicity, let's use the local arrays which are populated at start.
    // Ideally we should re-fetch or listen to real-time changes, but for this app structure, using local + reload is simpler.
    // However, to see changes immediately after edit, we should manipulate the memory array directly too.

    let targetArray = [];
    switch (category) {
        case 'easy':
        case 'medium':
        case 'hard':
        case 'level1':
            targetArray = level1QuestionBank; break;
        case 'level2': targetArray = level2QuestionBank; break;
        case 'level3': targetArray = level3QuestionBank; break;
    }

    renderManagerList(targetArray);
}

function renderManagerList(questions) {
    qmListContainer.innerHTML = "";

    if (questions.length === 0) {
        qmListContainer.innerHTML = '<div class="text-center text-gray-400 mt-10">Bu kategoride soru yok.</div>';
        return;
    }

    // Reverse for new items on top if desired, but default is OK
    questions.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = "p-4 rounded-lg border transition-all flex flex-col gap-2 relative overflow-hidden";
        item.style.background = "var(--panel-bg)";
        item.style.borderColor = "var(--glass-border)";
        item.style.backdropFilter = "var(--glass-blur)";

        // Hover effect helper via mouse events since inline hover is hard without a CSS class
        item.onmouseenter = () => item.style.borderColor = "var(--accent-color)";
        item.onmouseleave = () => item.style.borderColor = "var(--glass-border)";

        item.innerHTML = `
            <div class="flex justify-between items-start">
                <span class="text-xs font-mono font-bold" style="color: var(--accent-color)">#${index + 1}</span>
                <div class="flex space-x-2">
                    <button class="text-sm px-3 py-1 rounded font-bold shadow-sm" style="background: var(--item-hover); color: var(--text-primary); border: 1px solid var(--glass-border)" onclick="window.editQuestion('${q.id}', '${q.category}')">Düzenle</button>
                    <button class="text-sm bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded font-bold shadow-sm" onclick="window.deleteQuestion('${q.id}', '${q.category}')">Sil</button>
                </div>
            </div>
            <p class="font-medium text-lg leading-snug" style="color: var(--text-primary)">${q.q}</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm mt-2">
                <div class="p-2 rounded border" style="background: rgba(34, 197, 94, 0.1); color: #16a34a; border-color: rgba(34, 197, 94, 0.2);">✅ ${q.d}</div>
                <div class="p-2 rounded border" style="background: rgba(239, 68, 68, 0.1); color: #dc2626; border-color: rgba(239, 68, 68, 0.2);">❌ ${q.y1}</div>
                <div class="p-2 rounded border" style="background: rgba(239, 68, 68, 0.1); color: #dc2626; border-color: rgba(239, 68, 68, 0.2);">❌ ${q.y2}</div>
            </div>
        `;

        qmListContainer.appendChild(item);
    });
}

/**
 * Expose helper functions globally for inline onclick
 */
window.editQuestion = (id, category) => {
    let targetArray = [];
    switch (category) {
        case 'easy':
        case 'medium':
        case 'hard':
        case 'level1':
            targetArray = level1QuestionBank; break;
        case 'level2': targetArray = level2QuestionBank; break;
        case 'level3': targetArray = level3QuestionBank; break;
    }

    const q = targetArray.find(item => item.id === id);
    if (q) {
        openQuestionEditorForEdit(q);
    }
};

window.deleteQuestion = async (id, category) => {
    if (confirm("Bu soruyu silmek istediğinize emin misiniz?")) {
        try {
            const collectionPath = `/artifacts/${appId}/public/data/questions`;
            // 1. Try direct delete (Assuming ID is Firestore Doc ID)
            const docRef = doc(db, `${collectionPath}/${id}`);

            // We can't easily check if it exists before delete without a read, 
            // but deleteDoc doesn't throw if not found.
            // So we'll try to delete. If we are in "Fallback Mode" (using e1, m1), this won't delete the real doc (which has Auto-ID).
            // We need to check if the ID is a "local ID" format (optional but safe).

            // Try to find by ID (Direct)
            let targetDocRef = docRef;
            let found = false;

            // Check if document exists with this ID
            const docSnap = await getDoc(targetDocRef);
            if (docSnap.exists()) {
                found = true;
            } else {
                console.warn(`ID ile belge bulunamadı: ${id}. OriginalId ile aranıyor...`);
                // 2. Fallback: Search by 'originalId'
                const q = query(collection(db, collectionPath), where('originalId', '==', id));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    targetDocRef = querySnapshot.docs[0].ref;
                    found = true;
                    console.log(`Belge originalId ile bulundu ve silinecek: ${targetDocRef.id}`);
                }
            }

            if (found) {
                await deleteDoc(targetDocRef);
                console.log("Soru silindi.");
            } else {
                console.warn("Silinecek belge veritabanında bulunamadı (Yerel veri olabilir veya senkronizasyon hatası).");
                alert("Uyarı: Bu soru veritabanında bulunamadı. Yerel bir kopya görüntüleniyor olabilir.");
            }

            // Update local state by removing it locally or refetching
            // Refetching is safer to sync state
            await loadAllQuestionsFromDB();

            // Re-render
            loadQuestionsForManager(qmCategorySelect.value);

        } catch (e) {
            console.error("Silme hatası:", e);
            alert("Silerken hata oluştu: " + e.message);
        }
    }
};


function openQuestionEditorForNew() {
    qmEditIdInput.value = "";
    qmEditorTitle.textContent = "Yeni Soru Ekle";
    qmInputQuestion.value = "";
    qmInputCorrect.value = "";
    qmInputWrong1.value = "";
    qmInputWrong2.value = "";

    qmListContainer.classList.add('hidden');
    qmEditorContainer.classList.remove('hidden');
}

function openQuestionEditorForEdit(q) {
    qmEditIdInput.value = q.id;
    qmEditorTitle.textContent = "Soru Düzenle";
    qmInputQuestion.value = q.q;
    qmInputCorrect.value = q.d;
    qmInputWrong1.value = q.y1;
    qmInputWrong2.value = q.y2;

    qmListContainer.classList.add('hidden');
    qmEditorContainer.classList.remove('hidden');
}


async function handleSaveQuestion() {
    const id = qmEditIdInput.value;
    const category = qmCategorySelect.value;

    const newQ = qmInputQuestion.value.trim();
    const newD = qmInputCorrect.value.trim();
    const newY1 = qmInputWrong1.value.trim();
    const newY2 = qmInputWrong2.value.trim();

    if (!newQ || !newD || !newY1 || !newY2) {
        alert("Lütfen tüm alanları doldurun.");
        return;
    }

    const questionData = {
        q: newQ,
        d: newD,
        y1: newY1,
        y2: newY2,
        category: category
    };

    try {
        const questionsCol = collection(db, `/artifacts/${appId}/public/data/questions`);

        if (id) {
            // Edit
            const docRef = doc(db, `/artifacts/${appId}/public/data/questions/${id}`);

            // Check existence similar to delete
            const docSnap = await getDoc(docRef);
            let targetDocRef = docRef;

            if (!docSnap.exists()) {
                console.warn(`Edit: ID ile belge bulunamadı: ${id}. OriginalId ile aranıyor...`);
                const q = query(questionsCol, where('originalId', '==', id));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    targetDocRef = querySnapshot.docs[0].ref;
                    console.log(`Edit: Belge originalId ile bulundu: ${targetDocRef.id}`);
                } else {
                    // Belge yoksa yeni oluştur (ID koruyarak değil, yeni auto-ID ile ama originalId ile)
                    console.warn("Edit: Belge bulunamadı, yeni oluşturuluyor.");
                }
            }

            if (targetDocRef) {
                await updateDoc(targetDocRef, questionData);
            } else {
                throw new Error("Düzenlenecek soru veritabanında bulunamadı.");
            }

        } else {
            // New
            await addDoc(questionsCol, questionData);
        }

        // Refresh
        await loadAllQuestionsFromDB();
        loadQuestionsForManager(category);

        qmEditorContainer.classList.add('hidden');
        qmListContainer.classList.remove('hidden');

    } catch (e) {
        console.error("Kaydetme hatası:", e);
        alert("Kaydederken hata oluştu: " + e.message);
    }
}

/**
 * Parses and uploads multiple questions from custom text format
 */
async function handleBulkImport() {
    const rawData = bulkImportTextarea.value.trim();
    if (!rawData) {
        showBulkStatus("Lütfen soruları girin.", "error");
        return;
    }

    let questions = [];
    // Split blocks by blank lines (regex matches 2 or more newlines)
    const blocks = rawData.split(/\n\s*\n/);
    
    for (const block of blocks) {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l);
        // We need at least 4 lines: Question, Correct, Wrong1, Wrong2
        if (lines.length >= 4) {
            let cat = undefined;
            if (lines.length >= 5) {
                const catText = lines[4].toLowerCase();
                if (catText.includes('kolay')) cat = 'level1';
                else if (catText.includes('orta')) cat = 'level2';
                else if (catText.includes('zor')) cat = 'level3';
                else if (catText.includes('level1')) cat = 'level1';
                else if (catText.includes('level2')) cat = 'level2';
                else if (catText.includes('level3')) cat = 'level3';
            }
            
            questions.push({
                q: lines[0],
                d: lines[1],
                y1: lines[2],
                y2: lines[3],
                category: cat
            });
        } else if (lines.length > 0) {
            console.warn("Eksik satır içeren blok atlandı:", lines);
        }
    }

    if (questions.length === 0) {
        showBulkStatus("Geçerli formatta soru bulunamadı! Lütfen formatı kontrol edin.", "error");
        return;
    }

    confirmBulkImportButton.disabled = true;
    confirmBulkImportButton.textContent = "Yükleniyor...";
    showBulkStatus("İşleniyor...", "info");

    try {
        const questionsColPath = `/artifacts/${appId}/public/data/questions`;
        const batchSize = 500; // Firestore batch limit
        let count = 0;

        // Process in batches if necessary
        for (let i = 0; i < questions.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = questions.slice(i, i + batchSize);

            chunk.forEach(qData => {
                // Validation
                if (!qData.q || !qData.d || !qData.y1 || !qData.y2) {
                    console.warn("Eksik veri içeren soru atlandı:", qData);
                    return;
                }

                const docRef = doc(collection(db, questionsColPath));
                batch.set(docRef, {
                    q: qData.q,
                    d: qData.d,
                    y1: qData.y1,
                    y2: qData.y2,
                    category: qData.category || qmCategorySelect.value || 'level1',
                    createdAt: new Date().toISOString()
                });
                count++;
            });

            await batch.commit();
        }

        showBulkStatus(`Başarılı! ${count} soru içe aktarıldı.`, "success");
        
        // Refresh UI
        await loadAllQuestionsFromDB();
        if (qmCategorySelect.value) {
            loadQuestionsForManager(qmCategorySelect.value);
        }

        setTimeout(() => {
            bulkImportModal.classList.add('hidden');
            confirmBulkImportButton.disabled = false;
            confirmBulkImportButton.textContent = "Veritabanına Yaz";
        }, 2000);

    } catch (error) {
        console.error("Toplu içe aktarma hatası:", error);
        showBulkStatus("Hata: " + error.message, "error");
        confirmBulkImportButton.disabled = false;
        confirmBulkImportButton.textContent = "Veritabanına Yaz";
    }
}

function showBulkStatus(message, type) {
    bulkImportStatus.textContent = message;
    bulkImportStatus.classList.remove('hidden', 'bg-red-900/50', 'text-red-300', 'bg-green-900/50', 'text-green-300', 'bg-blue-900/50', 'text-blue-300');
    
    if (type === "error") {
        bulkImportStatus.classList.add('bg-red-900/50', 'text-red-300');
    } else if (type === "success") {
        bulkImportStatus.classList.add('bg-green-900/50', 'text-green-300');
    } else {
        bulkImportStatus.classList.add('bg-blue-900/50', 'text-blue-300');
    }
}
