// ===================================================================================
// LOGIKA SERVICE WORKER (NonAChill PWA)
// ===================================================================================

// --- Konfigurasi Cache ---
const CACHE_VERSION = 'v2.0';
const STATIC_CACHE_NAME = `movie-static-${CACHE_VERSION}`; // Cache untuk App Shell
const API_CACHE_NAME = `movie-api-${CACHE_VERSION}`;      // Cache untuk data dari API

// Daftar aset inti (App Shell) yang akan di-cache saat instalasi.
const urlsToCache = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap', // Cache font
    '/images/icon-192x192.png', // Ikon dari folder lokal
    '/images/icon-512x512.png'
];

// --- Event: Install ---
// Terjadi saat Service Worker pertama kali diinstal.
// Tujuannya adalah menyimpan App Shell ke dalam cache.
self.addEventListener('install', event => {
    console.log('Service Worker: Menginstall...');
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Menyimpan App Shell ke cache...');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                // Memaksa Service Worker yang baru untuk aktif segera.
                return self.skipWaiting();
            })
    );
});

// --- Event: Activate ---
// Terjadi setelah instalasi berhasil dan SW lama sudah tidak mengontrol klien.
// Tujuannya adalah membersihkan cache lama yang sudah tidak terpakai.
self.addEventListener('activate', event => {
    console.log('Service Worker: Mengaktifkan...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== STATIC_CACHE_NAME && cacheName !== API_CACHE_NAME)
                    .map(cacheName => {
                        console.log('Service Worker: Menghapus cache lama:', cacheName);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => {
            // Mengambil kontrol dari semua klien yang terbuka.
            return self.clients.claim();
        })
    );
});

// --- Event: Fetch ---
// Terjadi setiap kali aplikasi membuat permintaan jaringan (request).
// Di sinilah kita mengimplementasikan strategi caching.
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // STRATEGI 1: Network First, then Cache (untuk API OMDb)
    // - Selalu coba ambil data terbaru dari jaringan.
    // - Jika gagal (offline), baru ambil dari cache.
    // - Ini memastikan data selalu up-to-date jika ada koneksi.
    if (requestUrl.hostname === 'www.omdbapi.com') {
        event.respondWith(
            caches.open(API_CACHE_NAME).then(cache => {
                return fetch(event.request)
                    .then(networkResponse => {
                        // Jika berhasil, simpan response ke cache API dan kembalikan ke aplikasi.
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    })
                    .catch(() => {
                        // Jika fetch gagal (misal, offline), cari di cache API.
                        console.log('Fetch gagal dari network, mencari di API cache...');
                        return cache.match(event.request);
                    });
            })
        );
        return;
    }

    // STRATEGI 2: Cache First, then Network (untuk App Shell & aset statis)
    // - Cek di cache dulu. Jika ada, langsung kembalikan.
    // - Jika tidak ada di cache, baru ambil dari jaringan.
    // - Ini membuat aplikasi memuat sangat cepat (instant loading).
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request).then(networkResponse => {
                // Opcional: Simpan aset yang baru diakses ke cache statis
                // Ini berguna jika ada aset yang tidak termasuk di `urlsToCache` awal
                const responseToCache = networkResponse.clone();
                caches.open(STATIC_CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});
