// --- Konfigurasi Cache ---
// PENTING: Naikkan versi cache untuk memicu proses install ulang Service Worker.
const CACHE_VERSION = 'v2.1'; 
// Nama cache untuk aset statis (HTML, CSS, JS, Gambar) yang membentuk App Shell.
const STATIC_CACHE_NAME = `movie-static-${CACHE_VERSION}`;
// Nama cache terpisah untuk respons dari API. Ini mempermudah pengelolaan.
const API_CACHE_NAME = `movie-api-${CACHE_VERSION}`;

// Daftar aset inti (App Shell) yang akan di-cache saat Service Worker diinstal.
// Menggunakan path RELATIF (./) agar berfungsi di lokal dan di GitHub Pages.
const urlsToCache = [
    './', // Path relatif untuk root direktori proyek
    './index.html',
    './app.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap', // URL eksternal tidak perlu diubah
    './images/icon-192x192.png',
    './images/icon-512x512.png',
    './images/icon-maskable-512x512.png' // Pastikan file ini ada di folder /images
];

// --- Event: Install ---
// Event ini berjalan sekali per Service Worker, yaitu saat pertama kali diunduh.
// Tujuannya adalah untuk menyiapkan cache.
self.addEventListener('install', event => {
    console.log('Service Worker: Menginstall...');
    // event.waitUntil() memastikan Service Worker tidak akan diinstal sampai
    // kode di dalamnya selesai dieksekusi dengan sukses.
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                // Setelah cache 'STATIC_CACHE_NAME' terbuka, tambahkan semua aset dari urlsToCache.
                console.log('Service Worker: Menyimpan App Shell ke cache...');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                // self.skipWaiting() memaksa Service Worker yang sedang menunggu untuk menjadi aktif.
                // Ini mempercepat proses update dari versi SW lama ke baru.
                return self.skipWaiting();
            })
            .catch(error => {
                // Menambahkan log error agar lebih mudah saat debugging.
                console.error('Gagal menambahkan file ke cache saat install:', error);
            })
    );
});

// --- Event: Activate ---
// Event ini berjalan setelah instalasi berhasil dan versi SW lama sudah tidak mengontrol halaman.
// Tujuannya adalah untuk membersihkan cache lama yang sudah tidak terpakai.
self.addEventListener('activate', event => {
    console.log('Service Worker: Mengaktifkan...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            // caches.keys() mendapatkan semua nama cache yang ada.
            return Promise.all(
                cacheNames
                    // Filter untuk mendapatkan nama cache yang TIDAK sama dengan cache yang sedang aktif.
                    .filter(cacheName => cacheName !== STATIC_CACHE_NAME && cacheName !== API_CACHE_NAME)
                    // Hapus semua cache lama yang telah difilter.
                    .map(cacheName => {
                        console.log('Service Worker: Menghapus cache lama:', cacheName);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => {
            // self.clients.claim() memungkinkan SW yang baru diaktifkan untuk mengambil alih
            // kontrol dari semua klien (tab browser) yang terbuka dalam cakupannya.
            return self.clients.claim();
        })
    );
});

// --- Event: Fetch ---
// Event ini mencegat setiap permintaan jaringan (request) yang dibuat oleh aplikasi.
// Di sinilah kita mengimplementasikan strategi caching untuk merespons permintaan.
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // STRATEGI 1: Network First, then Cache (untuk API OMDb)
    if (requestUrl.hostname === 'www.omdbapi.com') {
        event.respondWith(
            caches.open(API_CACHE_NAME).then(cache => {
                return fetch(event.request)
                    .then(networkResponse => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    })
                    .catch(() => {
                        console.log('Fetch gagal dari network, mencari di API cache...');
                        return cache.match(event.request);
                    });
            })
        );
        return;
    }

    // STRATEGI 2: Cache First, then Network (untuk App Shell & aset statis)
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request).then(networkResponse => {
                const responseToCache = networkResponse.clone();
                caches.open(STATIC_CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});
