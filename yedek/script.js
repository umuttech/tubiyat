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
let loginView, quizView, endView, medalWonView, explanationView;
let countdownView;
let nameInput, loginButton;
let leaderboardContainer;
let questionNumber, questionText, answersContainer, timerContainer, scoreDisplay;
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

// --- SES DEĞİŞKENLERİ ---
const correctSound = new Audio('dogru.mp3');
const wrongSound = new Audio('yanlis.mp3');
const countdownSound = new Audio('geri_sayim.mp3');
const backgroundMusic = new Audio('arkaplan.mp3');

backgroundMusic.loop = true;
backgroundMusic.volume = 0.3;


let isMuted = true; // Başlangıçta ses kapalı
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
            try {
                correctSound.load();
                wrongSound.load();
                countdownSound.load();
                backgroundMusic.load();
            } catch (e) {
                console.warn("Ses yükleme hatası:", e);
            }
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


// --- SORU BANKASI (EDEBİYAT) ---
// --- SORU BANKASI (EDEBİYAT) ---
// --- DYNAMIC QUESTION BANKS (Loaded from Firestore) ---
let easyQuestionBank = [];
let mediumQuestionBank = [];
let hardQuestionBank = [];
let level2QuestionBank = [];
let level3QuestionBank = [];
// Backup for migration (Original hardcoded data renamed)
const initialEasyQuestions = [
    { id: "e1", q: "Aşağıdakilerden hangisi 'Beş Hececiler' grubunun bir üyesi değildir?", d: "Ahmet Haşim", y1: "Orhan Seyfi Orhon", y2: "Yusuf Ziya Ortaç" },
    { id: "e2", q: "Türk Edebiyatı'nda ilk pastoral şiir olan 'Sahra' kimin eseridir?", d: "Abdülhak Hamit Tarhan", y1: "Namık Kemal", y2: "Recaizade Mahmut Ekrem" },
    { id: "e3", q: "'Çalıkuşu' romanının baş karakteri Feride'nin mesleği nedir?", d: "Öğretmen", y1: "Doktor", y2: "Hemşire" },
    { id: "e4", q: "'Kuyucaklı Yusuf' romanı hangi yazara aittir?", d: "Sabahattin Ali", y1: "Yaşar Kemal", y2: "Orhan Kemal" },
    { id: "e5", q: "Sokrates'in savunmasını anlatan 'Eflatun'un Devlet'i' değil, 'Sokrates'in Savunması' (Apologia) adlı eseri hangi filozofa aittir?", d: "Platon (Eflatun)", y1: "Aristoteles", y2: "Sokrates" }
];

const initialMediumQuestions = [
    { id: "m1", q: "Divan Edebiyatı'nda hiciv (eleştiri) türünün en büyük ustası kabul edilen ve 'Siham-ı Kaza' adlı eseriyle bilinen şair kimdir?", d: "Nef'i", y1: "Baki", y2: "Fuzuli" },
    { id: "m2", q: "Tanzimat Dönemi'nde 'Vatan Şairi' olarak bilinen ve 'Vatan yahut Silistre' adlı tiyatro eseriyle ünlenen yazar kimdir?", d: "Namık Kemal", y1: "İbrahim Şinasi", y2: "Ziya Paşa" },
    { id: "m3", q: "'Aylak Adam' ve 'Anayurt Oteli' romanlarıyla tanınan, modern Türk Edebiyatı'nın önemli isimlerinden olan yazar kimdir?", d: "Yusuf Atılgan", y1: "Oğuz Atay", y2: "Sait Faik Abasıyanık" },
    { id: "m4", q: "Garip akımının (Birinci Yeni) kurucuları arasında kim bulunmaz?", d: "Cemal Süreya", y1: "Oktay Rifat Horozcu", y2: "Melih Cevdet Anday" }
];

const initialHardQuestions = [
    { id: "h1", q: "Nobel Edebiyat Ödülü'nü kazanan ilk ve tek Türk yazarımız kimdir?", d: "Orhan Pamuk", y1: "Yaşar Kemal", y2: "Aziz Nesin" },
    { id: "h2", q: "'Tutunamayanlar' adlı, post-modern tekniklerin kullanıldığı kült romanın yazarı kimdir?", d: "Oğuz Atay", y1: "Yusuf Atılgan", y2: "Latife Tekin" },
    { id: "h3", q: "Edebiyatımızda 'Bilinç akışı' tekniğini kullanan ilk roman olarak kabul edilen 'Bir Düğün Gecesi' hangi yazara aittir?", d: "Adalet Ağaoğlu", y1: "Füruzan", y2: "Pınar Kür" },
    { id: "h4", q: "Aşağıdaki eserlerden hangisi 'Dede Korkut Hikayeleri'nin bilinen nüshalarından biri (Örn: Dresden, Vatikan) değildir?", d: "Berlin Nüshası", y1: "Dresden Nüshası", y2: "Günbed Nüshası" },
    { id: "h5", q: "Divan şairi Baki'nin, Kanuni Sultan Süleyman'ın ölümü üzerine yazdığı ünlü mersiyenin adı nedir?", d: "Kanuni Mersiyesi", y1: "Şikayetname", y2: "Hüsrev ü Şirin" },
    { id: "h6", q: "Ahmet Hamdi Tanpınar'ın 'Huzur' romanındaki ana karakter kimdir?", d: "Mümtaz", y1: "İhsan", y2: "Nuran" },
    { id: "h7", q: "'İnce Memed' serisiyle tanınan ve eserlerinde Çukurova'yı anlatan yazarımız kimdir?", d: "Yaşar Kemal", y1: "Orhan Kemal", y2: "Kemal Tahir" },
    { id: "h8", q: "İlk Türk kadın romancı olarak kabul edilen ve 'Aşk-ı Memnu' romanının yazarı kimdir?", d: "Halid Ziya Uşaklıgil", y1: "Fatma Aliye Topuz", y2: "Reşat Nuri Güntekin" },
    { id: "h9", q: "Tasavvuf edebiyatının en önemli isimlerinden olan ve 'Mesnevi' adlı eseriyle bilinen düşünür kimdir?", d: "Mevlana Celaleddin Rumi", y1: "Yunus Emre", y2: "Hacı Bektaş-ı Veli" },
    { id: "h10", q: "Milli Edebiyat Dönemi'nde 'Türkçülük' akımının sistematiğini oluşturan yazar kimdir?", d: "Ziya Gökalp", y1: "Ömer Seyfettin", y2: "Mehmet Emin Yurdakul" }
];

const initialLevel2Questions = [
    { id: "lvl2s1", q: "Servet-i Fünun dönemi sanatçılarından Tevfik Fikret'in, oğlu Haluk için yazdığı ve gençliğe öğütler verdiği eserinin adı nedir?", d: "Haluk'un Defteri", y1: "Rübab-ı Şikeste", y2: "Şermin" },
    { id: "lvl2s2", q: "Cumhuriyet dönemi tiyatrosunun önemli isimlerinden, 'Keşanlı Ali Destanı' eserinin yazarı kimdir?", d: "Haldun Taner", y1: "Turgut Özakman", y2: "Necati Cumalı" },
    { id: "lvl2s3", q: "Divan edebiyatında, 5 mesnevinin bir araya gelmesiyle oluşan eser topluluğuna ne ad verilir?", d: "Hamse", y1: "Divan", y2: "Münşeat" },
    { id: "lvl2s4", q: "'Ben', 'O', 'Onlar' gibi zamirlerin yerine kullanılan ve tasavvufta Allah'ı simgeleyen harf hangisidir?", d: "Elif", y1: "Vav", y2: "Mim" },
    { id: "lvl2s5", q: "İstiklal Marşı şairimiz Mehmet Akif Ersoy'un şiirlerini topladığı eserinin genel adı nedir?", d: "Safahat", y1: "Asım'ın Nesli", y2: "Gölgeler" },
    { id: "lvl2s6", q: "Türk edebiyatında 'deneme' türünün en önemli temsilcilerinden biri olan ve 'Karalama Defteri' kitabının yazarı kimdir?", d: "Nurullah Ataç", y1: "Suut Kemal Yetkin", y2: "Ahmet Rasim" },
    { id: "lvl2s7", q: "İkinci Yeni akımının öncülerinden olan, 'Üvercinka' ve 'Göçebe' şiir kitaplarının sahibi şair kimdir?", d: "Cemal Süreya", y1: "Edip Cansever", y2: "Turgut Uyar" },
    { id: "lvl2s8", q: "Yakup Kadri Karaosmanoğlu'nun, tekkelerdeki yozlaşmayı anlatan romanı hangisidir?", d: "Nur Baba", y1: "Kiralık Konak", y2: "Sodom ve Gomore" },
    { id: "lvl2s9", q: "Türk dilinin bilinen ilk sözlüğü olan 'Divanü Lügati't-Türk' kim tarafından yazılmıştır?", d: "Kaşgarlı Mahmut", y1: "Yusuf Has Hacib", y2: "Edip Ahmet Yükneki" },
    { id: "lvl2s10", q: "Halk edebiyatında, saz eşliğinde söylenen ve genellikle aşk, doğa, kahramanlık konularını işleyen şiir türüne ne ad verilir?", d: "Koşma", y1: "Semai", y2: "Varsağı" },
    { id: "lvl2s11", q: "Batılı anlamda ilk romanımız olan 'Mai ve Siyah'ın başkahramanı kimdir?", d: "Ahmet Cemil", y1: "Adnan Bey", y2: "Bihter" },
    { id: "lvl2s12", q: "'Memleket Hikayeleri' adlı eseriyle Anadolu'yu edebiyata taşıyan yazarımız kimdir?", d: "Refik Halit Karay", y1: "Halide Edip Adıvar", y2: "Reşat Nuri Güntekin" },
    { id: "lvl2s13", q: "Ölüm temasını işlediği 'Sessiz Gemi' şiiriyle tanınan şairimiz kimdir?", d: "Yahya Kemal Beyatlı", y1: "Ahmet Haşim", y2: "Cahit Sıtkı Tarancı" },
    { id: "lvl2s14", q: "Yakup Kadri'nin 'Yaban' romanı hangi tarihi dönemde geçer?", d: "Kurtuluş Savaşı", y1: "Lale Devri", y2: "Tanzimat Dönemi" },
    { id: "lvl2s15", q: "Edebiyatımızdaki ilk tarihi roman olan 'Cezmi' kimin eseridir?", d: "Namık Kemal", y1: "Ahmet Mithat Efendi", y2: "Şemsettin Sami" },
    { id: "lvl2s16", q: "Türk sinemasına da uyarlanan 'Hababam Sınıfı' eserinin yazarı kimdir?", d: "Rıfat Ilgaz", y1: "Muzaffer İzgü", y2: "Aziz Nesin" },
    { id: "lvl2s17", q: "Aşağıdakilerden hangisi Beş Hececiler topluluğunun bir üyesidir?", d: "Faruk Nafiz Çamlıbel", y1: "Yahya Kemal Beyatlı", y2: "Mehmet Akif Ersoy" },
    { id: "lvl2s18", q: "'Kaldırımlar' şiiriyle özdeşleşen ve 'Çile' adlı şiir kitabının sahibi kimdir?", d: "Necip Fazıl Kısakürek", y1: "Ahmet Hamdi Tanpınar", y2: "Sezai Karakoç" },
    { id: "lvl2s19", q: "Sabahattin Ali'nin 'Kürk Mantolu Madonna' romanındaki kadın karakterin adı nedir?", d: "Maria Puder", y1: "Raif Efendi", y2: "Feride" },
    { id: "lvl2s20", q: "'Aganta Burina Burinata' eseriyle deniz insanlarını anlatan yazar kimdir?", d: "Halikarnas Balıkçısı", y1: "Sait Faik Abasıyanık", y2: "Orhan Veli Kanık" },
    { id: "lvl2s21", q: "Peyami Safa'nın 'Fatih-Harbiye' romanında işlenen temel çatışma nedir?", d: "Doğu-Batı Çatışması", y1: "Zengin-Fakir Çatışması", y2: "Köy-Kent Çatışması" },
    { id: "lvl2s22", q: "'Ağrı Dağı Efsanesi' romanı kime aittir?", d: "Yaşar Kemal", y1: "Orhan Pamuk", y2: "Kemal Tahir" },
    { id: "lvl2s23", q: "Servet-i Fünun döneminde yaşamasına rağmen bu topluluğa katılmayıp bağımsız kalan 'Sokağı Edebiyata Taşıyan Adam' kimdir?", d: "Hüseyin Rahmi Gürpınar", y1: "Ahmet Rasim", y2: "Ahmet Mithat Efendi" },
    { id: "lvl2s24", q: "'Şair-i Azam' unvanıyla bilinen Tanzimat dönemi şairi kimdir?", d: "Abdülhak Hamit Tarhan", y1: "Recaizade Mahmut Ekrem", y2: "Muallim Naci" },
    { id: "lvl2s25", q: "'Otuz Beş Yaş' şiiriyle tanınan şairimiz kimdir?", d: "Cahit Sıtkı Tarancı", y1: "Ahmet Muhip Dıranas", y2: "Ziya Osman Saba" },
    { id: "lvl2s26", q: "'Kırık Hayatlar' romanı hangi yazara aittir?", d: "Halid Ziya Uşaklıgil", y1: "Mehmet Rauf", y2: "Hüseyin Cahit Yalçın" },
    { id: "lvl2s27", q: "Orhan Veli'nin 1949-1950 yıllarında çıkardığı derginin adı nedir?", d: "Yaprak", y1: "Varlık", y2: "Büyük Doğu" },
    { id: "lvl2s28", q: "Ahmet Hamdi Tanpınar'ın deneme türündeki 'Beş Şehir' eserinde aşağıdaki şehirlerden hangisi yer almaz?", d: "İzmir", y1: "Ankara", y2: "Erzurum" },
    { id: "lvl2s29", q: "Milli Mücadele'yi anlatan 'Küçük Ağa' romanının yazarı kimdir?", d: "Tarık Buğra", y1: "Kemal Tahir", y2: "Attilâ İlhan" },
    { id: "lvl2s30", q: "Edebiyatımızda 'Hacer-i Esved' imgesiyle annesini anlattığı şiiriyle bilinen şair kimdir?", d: "Sezai Karakoç", y1: "Erdem Bayazıt", y2: "Cahit Zarifoğlu" }
];

const initialLevel3Questions = [
    { id: "lvl3s1", q: "Postmodern edebiyatın önemli örneklerinden biri olan 'Kara Kitap' romanında, Galip'in aradığı köşe yazarı Celal'in soyadı nedir?", d: "Salik", y1: "Şah", y2: "Simavi" },
    { id: "lvl3s2", q: "Ahmet Hamdi Tanpınar'ın 'Saatleri Ayarlama Enstitüsü' romanındaki baş karakter Hayri İrdal'ın ustası kimdir?", d: "Muvakkit Nuri Efendi", y1: "Halit Ayarcı", y2: "Ramiz Efendi" },
    { id: "lvl3s3", q: "Divan şiirinde sevgilinin saçı, boyu, dudağı gibi unsurlar için kullanılan kalıplaşmış sözlere ne denir?", d: "Mazmun", y1: "Mefhum", y2: "Teşbih" },
    { id: "lvl3s4", q: "Orhan Pamuk'un 'Benim Adım Kırmızı' romanında, nakkaşların üzerine tartıştığı temel felsefi çatışma nedir?", d: "Doğu-Batı Resim Sanatı", y1: "Aşk ve Nefret", y2: "Devlet ve Birey" },
    { id: "lvl3s5", q: "Cumhuriyet döneminde hece ölçüsünü aruz ölçüsü gibi ustaca kullanan ve 'Kaldırımlar' şairi olarak bilinen şair kimdir?", d: "Necip Fazıl Kısakürek", y1: "Cahit Sıtkı Tarancı", y2: "Ahmet Muhip Dıranas" },
    { id: "lvl3s6", q: "Fuzuli'nin 'Su Kasidesi'ni hangi peygamber için yazmıştır?", d: "Hz. Muhammed", y1: "Hz. Musa", y2: "Hz. İsa" },
    { id: "lvl3s7", q: "Türk edebiyatında ilk psikolojik roman denemesi olarak kabul edilen 'Zehra' kimin eseridir?", d: "Nabizade Nazım", y1: "Mehmet Rauf", y2: "Recaizade Mahmut Ekrem" },
    { id: "lvl3s8", q: "Şeyh Galip'in, insan-ı kâmil olma yolculuğunu sembolik bir dille anlattığı ünlü mesnevisi hangisidir?", d: "Hüsn ü Aşk", y1: "Leyla vü Mecnun", y2: "Mantıku't-Tayr" },
    { id: "lvl3s9", q: "Oğuz Atay'ın 'Tehlikeli Oyunlar' romanının baş karakteri kimdir?", d: "Hikmet Benol", y1: "Selim Işık", y2: "Turgut Özben" },
    { id: "lvl3s10", q: "Divan edebiyatında bir gazelin en güzel beytine ne ad verilir?", d: "Beytü'l Gazel", y1: "Taç Beyit", y2: "Şah Beyit" },
    { id: "lvl3s11", q: "Divan şiirinde toplumsal eleştirileriyle tanınan ve 'Terkib-i Bent' yazarı olan şair kimdir?", d: "Bağdatlı Ruhi", y1: "Ziya Paşa", y2: "Şeyhi" },
    { id: "lvl3s12", q: "Nabi'nin oğluna öğütler vermek amacıyla yazdığı didaktik mesnevisinin adı nedir?", d: "Hayriyye", y1: "Hayrabat", y2: "Tuhfetü'l Harameyn" },
    { id: "lvl3s13", q: "Divan edebiyatında bir kasidenin sunulduğu kişiyi (genellikle padişahı) öven bölümüne ne ad verilir?", d: "Methiye", y1: "Nesib", y2: "Fahriye" },
    { id: "lvl3s14", q: "Hüseyin Rahmi Gürpınar'ın 'Şıpsevdi' romanındaki Meftun Bey karakteri neyi temsil eder?", d: "Yanlış Batılılaşma", y1: "Cimrilik", y2: "Taassup" },
    { id: "lvl3s15", q: "Halid Ziya'nın 'Aşk-ı Memnu' romanının sonunda intihar eden karakter kimdir?", d: "Bihter", y1: "Nihal", y2: "Firdevs Hanım" },
    { id: "lvl3s16", q: "Metafizik ve psikolojik tahlillerin yoğun olduğu 'Matmazel Noraliya'nın Koltuğu' kimin eseridir?", d: "Peyami Safa", y1: "Tarık Buğra", y2: "Necip Fazıl Kısakürek" },
    { id: "lvl3s17", q: "Türklerin bilinen en eski destanlarından biri olan 'Oğuz Kağan Destanı' hangi devlete aittir?", d: "Asya Hun Devleti", y1: "Göktürkler", y2: "Uygurlar" },
    { id: "lvl3s18", q: "Halide Edip Adıvar'ın 'Sinekli Bakkal' romanındaki Rabia karakteri hangi sanat dalındaki yeteneğiyle ön plana çıkar?", d: "Musiki/Hafızlık", y1: "Ressamlık", y2: "Hattatlık" },
    { id: "lvl3s19", q: "Mithat Cemal Kuntay'ın Osmanlı'nın yıkılış dönemini anlattığı tek romanı hangisidir?", d: "Üç İstanbul", y1: "İstanbul'un İç Yüzü", y2: "Sodom ve Gomore" },
    { id: "lvl3s20", q: "'Gurbet Şairi' olarak bilinen ve 'Bingöl Çobanları' şiirini yazan şair kimdir?", d: "Kemalettin Kamu", y1: "Ömer Bedrettin Uşaklı", y2: "Faruk Nafiz Çamlıbel" },
    { id: "lvl3s21", q: "İhsan Oktay Anar'ın felsefi derinliği olan tarihi romanı hangisidir?", d: "Puslu Kıtalar Atlası", y1: "Kitab-ül Hiyel", y2: "Amat" },
    { id: "lvl3s22", q: "'Denize Açılan Kapı' ve 'Gül Yetiştiren Adam' eserleriyle tanınan yazarımız kimdir?", d: "Rasim Özdenören", y1: "Mustafa Kutlu", y2: "Sezai Karakoç" },
    { id: "lvl3s23", q: "Yedi Meşaleciler topluluğunun şiir yazmayıp sadece öykü türünde eser veren tek üyesi kimdir?", d: "Kenan Hulusi Koray", y1: "Ziya Osman Saba", y2: "Sabri Esat Siyavuşgil" },
    { id: "lvl3s24", q: "Cemil Meriç'in 'Bu Ülke' adlı eseri hangi edebi türdedir?", d: "Deneme/Düşünce", y1: "Roman", y2: "Şiir" },
    { id: "lvl3s25", q: "Divan şairi Şeyhi'nin, başından geçen bir soygun olayını hicvettiği ünlü eseri hangisidir?", d: "Harname", y1: "Siham-ı Kaza", y2: "Şikayetname" },
    { id: "lvl3s26", q: "Lale Devri'nin zevk ve eğlence şairi olarak bilinen Nedim'in asıl adı nedir?", d: "Ahmet", y1: "Mehmet", y2: "Mustafa" },
    { id: "lvl3s27", q: "Tanzimat Fermanı'nın ilanıyla başlayan Batılılaşma hareketinin edebiyattaki ilk bildirisi (mukaddimesi) hangi eserdedir?", d: "Tercüman-ı Ahval Mukaddimesi", y1: "Takvim-i Vakayi", y2: "Tasvir-i Efkar" },
    { id: "lvl3s28", q: "Oğuz Atay'ın 'Tutunamayanlar' romanında Selim Işık'ın intihar ettiği haberini arkadaşı Turgut Özben'e kim verir?", d: "Süleyman Kargı", y1: "Metin Kutbay", y2: "Olric" },
    { id: "lvl3s29", q: "Divan şiirinde, bir gazelin matla (ilk) beytinin dizeleri arasına üçer dize eklenerek oluşturulan nazım şekline ne ad verilir?", d: "Tahmis", y1: "Terbi", y2: "Tesdis" },
    { id: "lvl3s30", q: "'Fahriye Abla' şiiriyle tanınan ve hece ölçüsünü modern şiire uyarlayan şairimiz kimdir?", d: "Ahmet Muhip Dıranas", y1: "Cahit Sıtkı Tarancı", y2: "Behçet Necatigil" }
];

// --- ANA FONKSİYONLAR ---

/**
 * Sayfa yüklendiğinde çalışır, Firebase ve DOM'u başlatır
 */
window.onload = async () => {
    // --- OFFLINE DETECTION ---
    // NOT: Offline detection artık SADECE index.html'deki inline script tarafından yönetiliyor.
    // Buradaki classList.add/remove('hidden') yaklaşımı inline style.display ile ÇAKIŞIYORDU
    // ve mobilde overlay'in düzgün gösterilmesini engelliyordu. Kaldırıldı.
    // Load the configuration from the main process
    // Load the configuration from the main process (Electron) or global scope (Mobile/Web)
    let config;
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

    nameInput = document.getElementById('nameInput');
    nameError = document.getElementById('nameError');
    loginButton = document.getElementById('loginButton');
    leaderboardContainer = document.getElementById('leaderboardContainer');

    questionNumber = document.getElementById('questionNumber');
    questionText = document.getElementById('questionText');
    answersContainer = document.getElementById('answersContainer');
    timerContainer = document.getElementById('timerContainer');
    scoreDisplay = document.getElementById('scoreDisplay');

    endMessageText = document.getElementById('endMessageText');
    explainButton = document.getElementById('explainButton');

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
    settingsButton.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle('active');
    });

    document.addEventListener('click', () => {
        settingsMenu.classList.remove('active');
    });

    settingsMenu.addEventListener('click', (e) => e.stopPropagation());

    menuAdminBtn.addEventListener('click', () => {
        settingsMenu.classList.remove('active');
        window.openAdminAuth();
    });

    menuThemeBtn.addEventListener('click', () => {
        settingsMenu.classList.remove('active');
        themeModal.classList.remove('hidden');
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

    // Ses açma/kapama butonu
    if (menuSoundBtn) menuSoundBtn.addEventListener('click', toggleMute);

    // --- SPLASH SCREEN LOGIC ---
    setTimeout(() => {
        const splashScreen = document.getElementById('splashScreen');
        if (splashScreen) {
            splashScreen.style.opacity = '0';
            setTimeout(() => {
                splashScreen.classList.add('hidden');
            }, 1000); // Wait for transition duration
        }
    }, 2000); // Show for 2 seconds

    // Giriş butonu veya Enter
    loginButton.addEventListener('click', handleLogin);
    nameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    });
    nameInput.addEventListener('input', () => {
        nameError.classList.add('hidden');
        nameInput.classList.remove('border-red-500', 'border-2');
    });

    // Gemini açıklama butonları
    document.getElementById('explainButton').addEventListener('click', showExplanation);

    document.getElementById('closeExplanationButton').addEventListener('click', () => {
        explanationView.classList.add('hidden');
        currentQuestionIndex++;
        showQuestion();
    });

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
        loadQuestionsForManager('easy');
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
            deleteModal.classList.add('hidden');

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
    });


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
    // Puana göre sırala (En yüksek puan en üstte)
    const sortedUsers = allUsers.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));

    leaderboardContainer.innerHTML = ""; // Temizle

    if (sortedUsers.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-center text-secondary py-4';
        emptyMsg.textContent = "Henüz veri yok.";
        leaderboardContainer.appendChild(emptyMsg);
    }

    sortedUsers.forEach((user, index) => {
        const rank = index + 1;
        const userRankTitle = getRankTitle(user.totalPoints || 0); // Rütbe Hesapla
        const userRow = document.createElement('div');
        // Theme-aware row styling
        const isSelf = user.name === nameInput.value;
        userRow.className = `flex justify-between items-center p-3 rounded-md mb-2 transition-colors border ${isSelf ? 'bg-blue-500/20 border-blue-500' : 'bg-black/5 hover:bg-black/10 border-transparent'}`;

        userRow.innerHTML = `
            <div class='flex flex-col flex-1 min-w-0 mr-2'>
                <span class='font-bold text-primary truncate text-sm'>${rank}. ${user.name || 'Bilinmeyen'}</span>
                <span class='text-[10px] text-secondary uppercase tracking-widest truncate'>${userRankTitle}</span>
            </div>
            <div class='flex items-center space-x-2 text-xs font-mono text-primary shrink-0'>
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
                    totalPoints: 0, // Puan eklendi
                    medals: 0,
                    logins: 1,
                    seenQuestions: []
                };
                transaction.set(userDocRef, currentUserStats);
            } else {
                const data = userDoc.data();
                currentUserStats = {
                    ...data,
                    totalPoints: data.totalPoints || 0, // Mevcut puanı koru yoksa 0
                    logins: (data.logins || 0) + 1,
                    seenQuestions: data.seenQuestions || []
                };
                transaction.update(userDocRef, { logins: currentUserStats.logins });
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

    if (currentUserStats.medals >= 2) {
        // --- LEVEL 3: ELITE HARD (10 Puan, 10 Saniye) ---
        // Sadece Level 3 havuzundan, görülmemiş soruları al
        pool = filterSeen(level3QuestionBank).map(q => ({ ...q, points: 10, time: 10 }));
        // İstersek 10 tane ile sınırlayabiliriz
        pool = shuffleArray(pool).slice(0, 10);

    } else if (currentUserStats.medals === 1) {
        // --- LEVEL 2: ADVANCED HARD (5 Puan, 15 Saniye) ---
        // Sadece Level 2 havuzundan, görülmemiş soruları al
        pool = filterSeen(level2QuestionBank).map(q => ({ ...q, points: 5, time: 15 }));
        pool = shuffleArray(pool).slice(0, 10);

    } else {
        // --- LEVEL 1: STANDARD MIX ---
        // 4 Easy (1 Puan, 20sn), 3 Medium (2 Puan, 20sn), 3 Hard (3 Puan, 15sn)
        const fEasy = filterSeen(easyQuestionBank).map(q => ({ ...q, points: 1, time: 20 }));
        const fMedium = filterSeen(mediumQuestionBank).map(q => ({ ...q, points: 2, time: 20 }));
        const fHard = filterSeen(hardQuestionBank).map(q => ({ ...q, points: 3, time: 15 }));

        const sEasy = shuffleArray(fEasy);
        const sMedium = shuffleArray(fMedium);
        const sHard = shuffleArray(fHard);

        pool = [
            ...sEasy.slice(0, 4),
            ...sMedium.slice(0, 3),
            ...sHard.slice(0, 3)
        ];
    }

    currentQuizQuestions = shuffleArray(pool);

    // Eğer soru kalmadıysa uyarı verilebilir veya boş test başlar (endQuiz'e düşer)
    if (currentQuizQuestions.length === 0) {
        console.warn("Kullanıcı için uygun seviyede çözülmemiş soru kalmadı!");
    }

    switchView('quizView');
    showQuestion();
}

/**
 * Mevcut soruyu ekrana getirir ve sayacı başlatır
 */
function showQuestion() {
    clearInterval(timerInterval);

    explainButton.classList.add('hidden');
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

    questionNumber.textContent = `${currentQuestionIndex + 1} / 10`;
    scoreDisplay.textContent = `Puan: ${currentPoints}`;
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

    startTimer(q.time || 20);
}

/**
 * Sayaç mantığını yönetir
 */
function startTimer(seconds) {
    let timeLeft = seconds;
    const timerEl = document.getElementById('timer');
    const progressCircle = document.getElementById('timerProgressCircle');
    const totalDash = 2 * Math.PI * 28;

    progressCircle.setAttribute('stroke-dasharray', totalDash);

    timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;

        const dashOffset = totalDash * (timeLeft / seconds);
        progressCircle.setAttribute('stroke-dashoffset', dashOffset);

        if (timeLeft <= 5) {
            progressCircle.setAttribute('stroke', '#EF4444');
            timerEl.classList.add('text-red-500');
        } else {
            progressCircle.setAttribute('stroke', '#3B82F6');
            timerEl.classList.remove('text-red-500');
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimeUp();
        }
    }, 1000);
}

/**
 * Süre dolduğunda çalışır
 */
function handleTimeUp() {
    playSound(wrongSound);

    document.getElementById('timer').textContent = "0";
    document.getElementById('timerProgressCircle').setAttribute('stroke-dashoffset', 0);

    const allButtons = answersContainer.querySelectorAll('button');
    allButtons.forEach(btn => btn.disabled = true);

    const q = currentQuizQuestions[currentQuestionIndex];
    allButtons.forEach(btn => {
        if (btn.textContent === q.d) {
            btn.classList.remove('bg-black/10', 'bg-black/20', 'hover:bg-black/20', 'text-primary');
            btn.classList.add('bg-green-600', 'text-white');
        }
    });

    explainButton.classList.remove('hidden');

    nextQuestionTimeout = setTimeout(() => {
        currentQuestionIndex++;
        showQuestion();
    }, 2000);
}


/**
 * Bir cevaba tıklandığında çalışır
 */
function handleAnswerClick(clickedButton, isCorrect) {
    clearInterval(timerInterval);

    const allButtons = answersContainer.querySelectorAll('button');
    allButtons.forEach(btn => btn.disabled = true);

    const q = currentQuizQuestions[currentQuestionIndex];
    allButtons.forEach(btn => {
        if (btn.textContent === q.d) {
            btn.classList.remove('bg-black/10', 'bg-black/20', 'hover:bg-black/20', 'text-primary');
            btn.classList.add('bg-green-600', 'text-white');
            btn.classList.add('animate-pulse');
        }
    });

    if (isCorrect) {
        playSound(correctSound);

        currentScore++; // Doğru cevap sayısı
        currentPoints += q.points || 0; // Puan hesaplama
        scoreDisplay.textContent = `Puan: ${currentPoints}`;

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
    clearInterval(timerInterval);
    if (nextQuestionTimeout) {
        clearTimeout(nextQuestionTimeout);
    }

    console.log("Test bitti. Skor:", currentScore);

    const userDocPath = `/artifacts/${appId}/public/data/quizUsers_v2/${currentUserStats.name}`;
    const userDocRef = doc(db, userDocPath);

    const newMedals = currentUserStats.medals + (currentScore >= 8 ? 1 : 0);
    const newTotalCorrect = currentUserStats.totalCorrect + currentScore;
    const newTotalPoints = (currentUserStats.totalPoints || 0) + currentPoints; // Toplam puanı güncelle

    // --- SEEN QUESTIONS TRACKING ---
    const shownIds = currentQuizQuestions.map(q => q.id).filter(id => id);
    const existingSeen = currentUserStats.seenQuestions || [];
    const updatedSeen = [...new Set([...existingSeen, ...shownIds])];

    // Update local state
    currentUserStats.seenQuestions = updatedSeen;
    currentUserStats.medals = newMedals;
    currentUserStats.totalCorrect = newTotalCorrect;
    currentUserStats.totalPoints = newTotalPoints;

    try {
        await updateDoc(userDocRef, {
            totalCorrect: newTotalCorrect,
            totalPoints: newTotalPoints,
            medals: newMedals,
            seenQuestions: updatedSeen
        });
    } catch (error) {
        console.error("Skor güncellenirken hata:", error);
    }

    endMessageText.innerHTML = `
        <h2 class="text-3xl font-bold">Katılımınız için teşekkürler, ${currentUserStats.name}!</h2>
        <p class="text-xl text-secondary mt-4">Doğru: ${currentScore} / ${currentQuizQuestions.length}</p>
        <p class="text-2xl font-bold text-yellow-500 mt-2">Toplam Puan: ${currentPoints}</p>
    `;
    switchView('endView');
    launchConfettiFromCorners();

    const mainMenuButton = document.getElementById('tryAgainButton');
    mainMenuButton.addEventListener('click', () => {
        // Müziği durdur ve başa sar
        backgroundMusic.pause();
        backgroundMusic.currentTime = 0;

        // ✨ YENİ: Giriş ekranına dönerken ses butonunu da resetle
        isMuted = true; // Sesi tekrar kapat
        soundsLoaded = false; // Yeni giriş için sesleri "yüklenmemiş" say
        if (menuSoundIcon) menuSoundIcon.textContent = '🔇';
        if (menuSoundText) menuSoundText.textContent = 'Sesi Aç';

        // Clear the name input field
        nameInput.value = '';

        switchView('loginView');
    });
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
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`;

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
    // ✨ YENİ: Ses kapalıysa hiçbir şey çalma
    if (isMuted) return;

    audioElement.currentTime = 0; // Sesi başa sar
    const playPromise = audioElement.play();

    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.error("Ses efekti çalma hatası:", error);
        });
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

    document.getElementById(viewId).classList.remove('hidden');
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
// 🔄 UPDATE NOTIFICATION SYSTEM 🔄
// -------------------------------------------------------------------------

const APP_VERSION = "1.1.8"; // ✨ BU SÜRÜMÜ GÜNCELLEMEYİ UNUTMAYIN

async function checkAppVersion() {
    console.log("Sürüm kontrolü yapılıyor...", APP_VERSION);
    console.log("Bağlı Olunan Proje ID (appId):", appId); // Debug için eklendi

    // Config path: /artifacts/{appId}/public/data/system/config
    const configDocPath = `/artifacts/${appId}/public/data/system/config`;
    const configDocRef = doc(db, configDocPath);

    try {
        const docSnap = await getDoc(configDocRef);

        if (!docSnap.exists()) {
            console.log("Sistem konfigürasyonu bulunamadı, oluşturuluyor...");
            // Initial Config Create
            await setDoc(configDocRef, {
                latest_version: APP_VERSION,
                force_update: false,
                download_url: "https://github.com/your-repo/releases" // Placeholder
            }, { merge: true });
            return; // Same version, no update
        }

        const data = docSnap.data();
        const serverVersion = data.latest_version || APP_VERSION;
        const downloadUrl = data.download_url || "#";

        console.log(`Sunucu Sürümü: ${serverVersion}, Yerel Sürüm: ${APP_VERSION}`);

        // Simple string comparison for versioning (sufficient for 1.0.0 format usually)
        if (serverVersion > APP_VERSION) {
            console.warn("YENİ GÜNCELLEME VAR!");
            showUpdateModal(serverVersion, downloadUrl);
        }

    } catch (e) {
        console.error("Versiyon kontrolü hatası:", e);
    }
}

function showUpdateModal(newVersion, url) {
    const modal = document.getElementById('updateModal');
    if (!modal) return;

    document.getElementById('currentVersionDisplay').textContent = APP_VERSION;
    document.getElementById('newVersionDisplay').textContent = newVersion;

    const linkBtn = document.getElementById('updateLink');
    linkBtn.href = url;

    // If running in Electron, we might want to open in external browser
    linkBtn.onclick = (e) => {
        if (window.api && window.api.openExternal) {
            e.preventDefault();
            window.api.openExternal(url);
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

    const categories = ['easy', 'medium', 'hard', 'level2', 'level3'];
    const initialData = {
        'easy': initialEasyQuestions,
        'medium': initialMediumQuestions,
        'hard': initialHardQuestions,
        'level2': initialLevel2Questions,
        'level3': initialLevel3Questions
    };

    let needsMigration = false;

    // 1. Check if 'questions' collection is empty logic
    // We check just 'easy' category existence as a proxy or just try to fetch all
    // Since we want to categorize, we will add a 'category' field to each doc.

    const usersCollectionPath = `/artifacts/${appId}/public/data/questions`;
    const qCol = collection(db, usersCollectionPath);

    try {
        // 🚀 CHECK PERSISTENT MIGRATION FLAG
        const configDocPath = `/artifacts/${appId}/public/data/system/config`;
        const configDocRef = doc(db, configDocPath);
        const configSnap = await getDoc(configDocRef);

        let isMigrationDone = false;
        if (configSnap.exists()) {
            isMigrationDone = configSnap.data().migration_done === true;
        }

        const snapshot = await getDocs(qCol);

        if (snapshot.empty && !isMigrationDone) {
            console.log("Veritabanı boş ve migrasyon yapılmamış, sorular migre ediliyor...");
            needsMigration = true;
        } else {
            console.log(`Veritabanında ${snapshot.size} soru bulundu. (Migrasyon durumu: ${isMigrationDone})`);
        }

        if (needsMigration) {
            const batch = writeBatch(db);
            let operationCount = 0;

            for (const cat of categories) {
                const questions = initialData[cat];
                questions.forEach(q => {
                    // Create a new ref
                    const newDocRef = doc(qCol); // Auto-ID
                    batch.set(newDocRef, {
                        ...q,
                        category: cat,
                        originalId: q.id
                    });
                    operationCount++;
                });
            }

            await batch.commit();

            // Mark migration as done persistently
            const configDocPath = `/artifacts/${appId}/public/data/system/config`;
            const configDocRef = doc(db, configDocPath);
            await setDoc(configDocRef, { migration_done: true }, { merge: true });

            console.log("Migrasyon tamamlandı!", operationCount, "soru eklendi.");

            // Re-fetch after migration
            await loadAllQuestionsFromDB();
        } else {
            // Just load existing
            await loadAllQuestionsFromDB();
        }

    } catch (e) {
        console.error("Soru yükleme/migrasyon hatası:", e);
        // Fallback to local data
        easyQuestionBank = initialEasyQuestions;
        mediumQuestionBank = initialMediumQuestions;
        hardQuestionBank = initialHardQuestions;
        level2QuestionBank = initialLevel2Questions;
        level3QuestionBank = initialLevel3Questions;
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
    easyQuestionBank = [];
    mediumQuestionBank = [];
    hardQuestionBank = [];
    level2QuestionBank = [];
    level3QuestionBank = [];

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const qObj = { id: docSnap.id, ...data }; // Use Firestore ID as ID

        // Sort into arrays
        switch (data.category) {
            case 'easy': easyQuestionBank.push(qObj); break;
            case 'medium': mediumQuestionBank.push(qObj); break;
            case 'hard': hardQuestionBank.push(qObj); break;
            case 'level2': level2QuestionBank.push(qObj); break;
            case 'level3': level3QuestionBank.push(qObj); break;
            default: easyQuestionBank.push(qObj); // Fallback
        }
    });

    console.log("Sorular yüklendi:", {
        easy: easyQuestionBank.length,
        medium: mediumQuestionBank.length,
        hard: hardQuestionBank.length,
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
        case 'easy': targetArray = easyQuestionBank; break;
        case 'medium': targetArray = mediumQuestionBank; break;
        case 'hard': targetArray = hardQuestionBank; break;
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
        item.className = "bg-gray-800 p-4 rounded-lg border border-gray-700 hover:border-blue-500 transition-all flex flex-col gap-2";

        item.innerHTML = `
            <div class="flex justify-between items-start">
                <span class="text-xs font-mono text-blue-400">#${index + 1}</span>
                <div class="flex space-x-2">
                    <button class="text-sm bg-yellow-600 hover:bg-yellow-500 text-white px-2 py-1 rounded" onclick="window.editQuestion('${q.id}', '${q.category}')">Düzenle</button>
                    <button class="text-sm bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded" onclick="window.deleteQuestion('${q.id}', '${q.category}')">Sil</button>
                </div>
            </div>
            <p class="text-white font-medium text-lg leading-snug">${q.q}</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm mt-2">
                <div class="bg-green-900/40 text-green-300 p-2 rounded border border-green-900/50">✅ ${q.d}</div>
                <div class="bg-red-900/40 text-red-300 p-2 rounded border border-red-900/50">❌ ${q.y1}</div>
                <div class="bg-red-900/40 text-red-300 p-2 rounded border border-red-900/50">❌ ${q.y2}</div>
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
        case 'easy': targetArray = easyQuestionBank; break;
        case 'medium': targetArray = mediumQuestionBank; break;
        case 'hard': targetArray = hardQuestionBank; break;
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
                    // Opsiyonel: Hata fırlatmak yerine yeni ekle. Ama ID değişecek.
                    // Kullanıcıya bilgi versek daha iyi.
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