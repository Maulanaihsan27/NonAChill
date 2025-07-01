document.addEventListener('DOMContentLoaded', () => {

    // --- SELEKTOR DOM & VARIABEL GLOBAL ---
    // Mengambil semua elemen HTML yang dibutuhkan dan menyimpannya dalam konstanta.
    const apiKey = 'thewdb'; // Kunci API pribadi untuk OMDb.
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const movieContainer = document.getElementById('movie-container');
    const placeholder = document.getElementById('placeholder');
    const statusIndicator = document.getElementById('status-indicator');
    const modal = document.getElementById('movie-modal');
    const modalContent = document.getElementById('modal-content');
    const modalBody = document.getElementById('modal-body');
    const modalCloseButton = document.getElementById('modal-close-button');
    const backToHomeContainer = document.getElementById('back-to-home-container');
    const backToHomeButton = document.getElementById('back-to-home-button');
    const sectionTitle = document.getElementById('section-title');
    const installButton = document.getElementById('install-button');

    let deferredPrompt; // Variabel untuk menyimpan event 'beforeinstallprompt'.
    let db; // Variabel untuk menampung instance IndexedDB.

    // --- Daftar Kata Kunci untuk Rekomendasi Acak ---
    // Array ini digunakan untuk memberikan rekomendasi film yang bervariasi setiap kali halaman dimuat.
    const recommendationKeywords = [
        'Marvel', 'Batman', 'Star Wars', 'Harry Potter', 'Mission', 'Fast', 
        'Disney', 'Pixar', 'Zombie', 'Future', 'War', 'Dragon', 'Lord of the Rings',
        'Matrix', 'Avatar', 'Alien', 'Action', 'Comedy', 'Horror'
    ];

    // --- INISIALISASI INDEXEDDB ---
    // Fungsi untuk menyiapkan dan membuka database IndexedDB.
    const initDB = () => {
        const dbName = 'MoviePWA_DB'; // Nama database.
        const storeName = 'movies'; // Nama object store (seperti tabel di SQL).
        const request = indexedDB.open(dbName, 1); // Membuka koneksi ke database.

        // Penanganan error jika database gagal dibuka.
        request.onerror = (event) => console.error('Error saat membuka IndexedDB:', event.target.errorCode);
        
        // Jika berhasil, simpan instance DB dan panggil fungsi untuk memuat rekomendasi awal.
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database IndexedDB berhasil dibuka.');
            loadInitialRecommendations();
        };

        // Fungsi ini berjalan jika versi database berubah atau saat pertama kali dibuat.
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Membuat object store jika belum ada.
            if (!db.objectStoreNames.contains(storeName)) {
                const objectStore = db.createObjectStore(storeName, { keyPath: 'imdbID' }); // 'imdbID' sebagai kunci unik.
                objectStore.createIndex('Title', 'Title', { unique: false }); // Membuat index untuk pencarian berdasarkan judul.
                console.log('Object store "movies" berhasil dibuat.');
            }
        };
    };

    // --- FUNGSI DATABASE (CRUD - Create, Read, Update, Delete) ---
    // Fungsi untuk menyimpan atau memperbarui data film ke IndexedDB.
    const saveMovieToDB = (movieData) => {
        if (!db) return; // Pastikan database sudah siap.
        const transaction = db.transaction(['movies'], 'readwrite'); // Mulai transaksi.
        const objectStore = transaction.objectStore('movies');
        objectStore.put(movieData); // 'put' akan menambah data baru atau update jika key sudah ada.
    };

    // Fungsi untuk mengambil data film dari IndexedDB.
    const getMoviesFromDB = (searchQuery) => {
        return new Promise((resolve, reject) => {
            if (!db) return reject('Database tidak siap.');
            const transaction = db.transaction(['movies'], 'readonly');
            const request = transaction.objectStore('movies').getAll(); // Ambil semua data.
            request.onerror = (event) => reject('Error mengambil data dari DB:', event.target.errorCode);
            request.onsuccess = (event) => {
                const allMovies = event.target.result;
                if (searchQuery) {
                    // Jika ada query pencarian, filter hasilnya.
                    const filtered = allMovies.filter(m => m.Title.toLowerCase().includes(searchQuery.toLowerCase()));
                    resolve(filtered);
                } else {
                    // Jika tidak, kembalikan semua film.
                    resolve(allMovies);
                }
            };
        });
    };
    
    // Fungsi untuk mengambil detail satu film berdasarkan imdbID dari IndexedDB.
    const getMovieDetailsFromDB = (imdbID) => {
        return new Promise((resolve) => {
            if (!db) return resolve(null);
            const request = db.transaction(['movies']).objectStore('movies').get(imdbID);
            request.onsuccess = e => resolve(e.target.result);
            request.onerror = () => resolve(null); // Kembalikan null jika terjadi error.
        });
    };

    // --- LOGIKA UTAMA APLIKASI ---
    // Fungsi terpusat untuk melakukan panggilan (fetch) ke API OMDb.
    const fetchFromAPI = async (params) => {
        const url = `https://www.omdbapi.com/?apikey=${apiKey}&${params}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok.');
        const data = await response.json();
        if (data.Response === 'False') throw new Error(data.Error || 'Data tidak ditemukan.');
        return data;
    };

    // Fungsi untuk memuat rekomendasi film awal.
    const loadInitialRecommendations = async () => {
        // Pilih satu kata kunci secara acak dari daftar.
        const randomKeyword = recommendationKeywords[Math.floor(Math.random() * recommendationKeywords.length)];

        sectionTitle.textContent = `Rekomendasi: ${randomKeyword}`;
        showPlaceholder(`Memuat film tentang "${randomKeyword}"...`);
        movieContainer.innerHTML = '';
        backToHomeContainer.classList.add('hidden');

        try {
            // Coba ambil data dari API menggunakan kata kunci acak.
            const data = await fetchFromAPI(`s=${randomKeyword}`);
            displayMovies(data.Search); // Tampilkan film.
            data.Search.forEach(movie => saveMovieToDB(movie)); // Simpan hasilnya ke DB.
            updateStatusIndicator('Menampilkan data terbaru.', 'online');
        } catch (error) {
            // Jika gagal (misal: offline), coba ambil dari DB lokal.
            console.warn(`Gagal mengambil "${randomKeyword}" dari jaringan, mencoba dari DB lokal...`, error);
            try {
                const allOfflineMovies = await getMoviesFromDB();
                if (allOfflineMovies.length > 0) {
                    // Acak semua film yang ada di DB dan ambil 10 pertama.
                    const shuffled = allOfflineMovies.sort(() => 0.5 - Math.random());
                    const selection = shuffled.slice(0, 10);
                    displayMovies(selection);
                    sectionTitle.textContent = 'Rekomendasi Film (Offline)';
                    updateStatusIndicator('Anda offline. Menampilkan data dari cache.', 'offline');
                } else {
                    showPlaceholder('Gagal memuat rekomendasi. Periksa koneksi internet Anda.');
                }
            } catch (dbError) {
                showPlaceholder('Gagal mengakses data offline.');
            }
        }
    };

    // Fungsi yang dijalankan saat form pencarian di-submit.
    const handleSearch = async (e) => {
        e.preventDefault(); // Mencegah form dari reload halaman.
        const searchTerm = searchInput.value.trim();
        if (!searchTerm) return; // Jangan lakukan apa-apa jika input kosong.

        sectionTitle.textContent = `Hasil Pencarian untuk "${searchTerm}"`;
        showPlaceholder('Mencari film...');
        movieContainer.innerHTML = '';
        
        try {
            // Coba cari dari API.
            const data = await fetchFromAPI(`s=${searchTerm}`);
            displayMovies(data.Search);
            data.Search.forEach(movie => saveMovieToDB(movie));
            updateStatusIndicator('Menampilkan hasil pencarian terbaru.', 'online');
            backToHomeContainer.classList.remove('hidden'); // Tampilkan tombol kembali.
        } catch (error) {
            // Jika gagal, coba cari dari DB lokal.
            console.warn(`Gagal mencari "${searchTerm}" dari jaringan, mencoba dari DB...`, error);
            try {
                const offlineMovies = await getMoviesFromDB(searchTerm);
                if (offlineMovies.length > 0) {
                    displayMovies(offlineMovies);
                    updateStatusIndicator('Anda offline. Menampilkan data dari cache.', 'offline');
                    backToHomeContainer.classList.remove('hidden');
                } else {
                    showPlaceholder(error.message === 'Movie not found!' ? `Film "${searchTerm}" tidak ditemukan.` : 'Gagal mencari film. Periksa koneksi Anda.');
                    backToHomeContainer.classList.add('hidden');
                }
            } catch (dbError) {
                showPlaceholder('Gagal mengakses data offline.');
            }
        }
    };

    // --- FUNGSI RENDER UI ---
    // Menampilkan pesan status (seperti "Memuat..." atau "Tidak ditemukan").
    const showPlaceholder = (message) => {
        placeholder.textContent = message;
        placeholder.style.display = 'block';
    };

    // Menyembunyikan pesan status.
    const hidePlaceholder = () => {
        placeholder.style.display = 'none';
    };

    // Fungsi untuk merender daftar film ke dalam container.
    const displayMovies = (movies) => {
        movieContainer.innerHTML = ''; // Kosongkan container dulu.
        if (!movies || movies.length === 0) {
            showPlaceholder('Tidak ada film yang cocok dengan pencarian Anda.');
            return;
        }
        hidePlaceholder();
        movies.forEach(movie => {
            const movieElement = document.createElement('div');
            movieElement.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 cursor-pointer group';
            // Jika poster tidak ada, gunakan placeholder.
            const posterUrl = movie.Poster === 'N/A' 
                ? `https://placehold.co/400x600/1f2937/ffffff?text=${encodeURIComponent(movie.Title)}` 
                : movie.Poster;
            
            movieElement.innerHTML = `
                <div class="relative">
                    <img src="${posterUrl}" alt="Poster ${movie.Title}" class="w-full h-96 object-cover" onerror="this.onerror=null;this.src='https://placehold.co/400x600/1f2937/ffffff?text=Image+Error';">
                    <div class="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <p class="text-white text-lg font-bold">Lihat Detail</p>
                    </div>
                </div>
                <div class="p-4">
                    <h3 class="text-lg font-bold truncate">${movie.Title}</h3>
                    <p class="text-gray-600 dark:text-gray-400">${movie.Year}</p>
                </div>`;
            // Tambahkan event listener untuk menampilkan detail saat di-klik.
            movieElement.addEventListener('click', () => showMovieDetails(movie.imdbID));
            movieContainer.appendChild(movieElement);
        });
    };

    // Fungsi untuk menampilkan modal dengan detail film.
    const showMovieDetails = async (imdbID) => {
        modal.classList.remove('hidden'); // Tampilkan modal.
        modalBody.innerHTML = '<p class="text-center p-8">Memuat detail...</p>';
        setTimeout(() => modalContent.classList.remove('scale-95'), 10); // Efek animasi.

        try {
            // Prioritaskan ambil data dari DB.
            let details = await getMovieDetailsFromDB(imdbID);
            // Jika data di DB tidak lengkap (misal, belum ada Plot-nya), ambil dari API.
            if (!details || !details.Plot) {
                console.log('Detail tidak lengkap di DB, mengambil dari jaringan...');
                details = await fetchFromAPI(`i=${imdbID}&plot=full`);
                saveMovieToDB(details); // Simpan detail yang lebih lengkap ke DB.
            }
            populateModal(details); // Isi modal dengan data.
        } catch (error) {
            console.error("Gagal menampilkan detail:", error);
            modalBody.innerHTML = `<p class="text-center p-8 text-red-500">Gagal memuat detail. Coba lagi saat online.</p>`;
        }
    };
    
    // Fungsi untuk mengisi konten modal dengan data film.
    const populateModal = (movie) => {
        const posterUrl = movie.Poster === 'N/A' ? `https://placehold.co/400x600/1f2937/ffffff?text=${encodeURIComponent(movie.Title)}` : movie.Poster;
        // Format bagian rating.
        const ratingsHTML = (movie.Ratings && movie.Ratings.length > 0)
            ? movie.Ratings.map(rating => `
                <div class="flex justify-between border-b border-gray-200 dark:border-gray-700 py-1">
                    <span class="font-semibold">${rating.Source}</span>
                    <span class="font-bold">${rating.Value}</span>
                </div>`).join('')
            : '<p>Rating tidak tersedia.</p>';

        modalBody.innerHTML = `
            <div class="flex flex-col md:flex-row gap-6">
                <div class="md:w-1/3 flex-shrink-0">
                    <img src="${posterUrl}" alt="Poster ${movie.Title}" class="w-full rounded-lg shadow-md" onerror="this.onerror=null;this.src='https://placehold.co/400x600/1f2937/ffffff?text=Error';">
                </div>
                <div class="md:w-2/3">
                    <h2 class="text-3xl font-bold mb-2">${movie.Title} <span class="font-light text-2xl">(${movie.Year})</span></h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">${movie.Genre} &bull; ${movie.Runtime} &bull; ${movie.Rated}</p>
                    <h3 class="text-xl font-semibold mt-4 mb-2 border-b border-gray-300 dark:border-gray-600 pb-1">Plot</h3>
                    <p class="text-gray-700 dark:text-gray-300">${movie.Plot || 'Deskripsi tidak tersedia.'}</p>
                    <h3 class="text-xl font-semibold mt-4 mb-2 border-b border-gray-300 dark:border-gray-600 pb-1">Ratings</h3>
                    <div class="space-y-2">${ratingsHTML}</div>
                    <p class="mt-4"><strong>Sutradara:</strong> ${movie.Director || 'N/A'}</p>
                    <p><strong>Aktor:</strong> ${movie.Actors || 'N/A'}</p>
                </div>
            </div>`;
    };

    // Fungsi untuk menutup modal.
    const closeModal = () => {
        modal.classList.add('hidden');
        modalContent.classList.add('scale-95');
    };

    // --- LOGIKA PWA & STATUS KONEKSI ---
    // Mendaftarkan Service Worker.
    const registerServiceWorker = () => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('Service Worker berhasil didaftarkan.', reg))
                    .catch(err => console.error('Pendaftaran Service Worker gagal:', err));
            });
        }
    };

    // Menangani event 'beforeinstallprompt' untuk menampilkan tombol install.
    const handleInstallPrompt = (e) => {
        e.preventDefault(); // Cegah prompt default browser.
        deferredPrompt = e;
        installButton.classList.remove('hidden'); // Tampilkan tombol kita.
    };

    // Fungsi yang dijalankan saat tombol install di-klik.
    const installApp = () => {
        if (!deferredPrompt) return;
        installButton.classList.add('hidden');
        deferredPrompt.prompt(); // Tampilkan prompt instalasi.
        deferredPrompt.userChoice.then(choiceResult => {
            console.log('Pilihan pengguna untuk instalasi:', choiceResult.outcome);
            deferredPrompt = null;
        });
    };

    // Memperbarui indikator status koneksi (bar di atas).
    const updateStatusIndicator = (message, status) => {
        statusIndicator.textContent = message;
        statusIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');
        
        if (status === 'online') {
            statusIndicator.classList.add('bg-green-500');
            setTimeout(hideStatusIndicator, 3000); // Sembunyikan setelah 3 detik.
        } else if (status === 'offline') {
            statusIndicator.classList.add('bg-red-500');
        } else {
            statusIndicator.classList.add('bg-yellow-500');
        }
        
        statusIndicator.classList.remove('-translate-y-full'); // Tampilkan bar.
    };

    // Menyembunyikan indikator status.
    const hideStatusIndicator = () => {
        statusIndicator.classList.add('-translate-y-full');
    };

    // Menangani perubahan status koneksi.
    const handleConnectionChange = () => {
        if (navigator.onLine) {
            updateStatusIndicator('Anda kembali online.', 'online');
            loadInitialRecommendations(); // Muat ulang data saat kembali online.
        } else {
            updateStatusIndicator('Anda sekarang offline.', 'offline');
        }
    };

    // --- EVENT LISTENERS ---
    // Menetapkan semua event listener ke elemen-elemen yang sesuai.
    searchForm.addEventListener('submit', handleSearch);
    backToHomeButton.addEventListener('click', loadInitialRecommendations);
    modalCloseButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    installButton.addEventListener('click', installApp);
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);

    // --- INISIALISASI APLIKASI ---
    // Fungsi utama yang memulai semua proses.
    const initializeApp = () => {
        registerServiceWorker();
        initDB();
        // Cek status koneksi saat aplikasi pertama kali dimuat.
        if (!navigator.onLine) {
            updateStatusIndicator('Anda sedang offline.', 'offline');
        }
    };

    // Jalankan aplikasi!
    initializeApp();
});
