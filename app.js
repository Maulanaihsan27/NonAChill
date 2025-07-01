    document.addEventListener('DOMContentLoaded', () => {

    // --- SELEKTOR DOM & VARIABEL GLOBAL ---
    const apiKey = 'thewdb'; // API key dari OMDb
    const searchForm = document.getElementById('search-form'); // Form pencarian
    const searchInput = document.getElementById('search-input'); // Input teks pencarian
    const movieContainer = document.getElementById('movie-container'); // Kontainer kartu film
    const placeholder = document.getElementById('placeholder'); // Placeholder saat loading/empty
    const statusIndicator = document.getElementById('status-indicator'); // Indikator status koneksi
    const modal = document.getElementById('movie-modal'); // Modal detail film
    const modalContent = document.getElementById('modal-content'); // Isi modal
    const modalBody = document.getElementById('modal-body'); // Body modal
    const modalCloseButton = document.getElementById('modal-close-button'); // Tombol close modal
    const backToHomeContainer = document.getElementById('back-to-home-container'); // Kontainer tombol back
    const backToHomeButton = document.getElementById('back-to-home-button'); // Tombol kembali ke home
    const sectionTitle = document.getElementById('section-title'); // Judul bagian (Rekomendasi / Pencarian)
    const installButton = document.getElementById('install-button'); // Tombol install aplikasi PWA

    let deferredPrompt; // Event beforeinstallprompt disimpan sementara
    let db; // Objek database IndexedDB

    // --- INISIALISASI INDEXEDDB UNTUK MENYIMPAN FILM SECARA OFFLINE ---
    const initDB = () => {
        const dbName = 'MoviePWA_DB'; // Nama database
        const storeName = 'movies'; // Nama object store
        const request = indexedDB.open(dbName, 1); // Membuka atau membuat DB

        request.onerror = (event) => console.error('Error saat membuka IndexedDB:', event.target.errorCode);
        request.onsuccess = (event) => {
            db = event.target.result; // DB siap digunakan
            console.log('Database IndexedDB berhasil dibuka.');
            loadInitialRecommendations(); // Langsung muat data awal
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                const objectStore = db.createObjectStore(storeName, { keyPath: 'imdbID' }); // Menyimpan berdasarkan imdbID
                objectStore.createIndex('Title', 'Title', { unique: false }); // Membuat index judul
                console.log('Object store "movies" berhasil dibuat.');
            }
        };
    };

    // --- SIMPAN FILM KE INDEXEDDB ---
    const saveMovieToDB = (movieData) => {
        if (!db) return;
        const transaction = db.transaction(['movies'], 'readwrite');
        const objectStore = transaction.objectStore('movies');
        objectStore.put(movieData); // Menyimpan atau meng-update film
    };

    // --- AMBIL FILM DARI INDEXEDDB BERDASARKAN QUERY ---
    const getMoviesFromDB = (searchQuery) => {
        return new Promise((resolve, reject) => {
            if (!db) return reject('Database tidak siap.');
            const transaction = db.transaction(['movies'], 'readonly');
            const request = transaction.objectStore('movies').getAll();

            request.onerror = (event) => reject('Error mengambil data dari DB:', event.target.errorCode);
            request.onsuccess = (event) => {
                const allMovies = event.target.result;
                if (searchQuery) {
                    // Filter film yang judulnya mengandung query
                    const filtered = allMovies.filter(m => m.Title.toLowerCase().includes(searchQuery.toLowerCase()));
                    resolve(filtered);
                } else {
                    resolve(allMovies); // Kembalikan semua data
                }
            };
        });
    };

    // --- AMBIL DETAIL FILM TERTENTU DARI DB BERDASARKAN imdbID ---
    const getMovieDetailsFromDB = (imdbID) => {
        return new Promise((resolve) => {
            if (!db) return resolve(null);
            const request = db.transaction(['movies']).objectStore('movies').get(imdbID);
            request.onsuccess = e => resolve(e.target.result); // Return data film
            request.onerror = () => resolve(null);
        });
    };

    // --- FETCH DATA DARI OMDb API BERDASARKAN PARAMETER QUERY ---
    const fetchFromAPI = async (params) => {
        const url = `https://www.omdbapi.com/?apikey=${apiKey}&${params}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok.');
        const data = await response.json();
        if (data.Response === 'False') throw new Error(data.Error || 'Data tidak ditemukan.');
        return data;
    };

    // --- MUAT FILM REKOMENDASI DEFAULT (AVENGERS) ---
    const loadInitialRecommendations = async () => {
        sectionTitle.textContent = 'Rekomendasi Film';
        showPlaceholder('Memuat rekomendasi film...');
        movieContainer.innerHTML = '';
        backToHomeContainer.classList.add('hidden');

        try {
            const data = await fetchFromAPI('s=avengers'); // Film default
            displayMovies(data.Search);
            data.Search.forEach(movie => saveMovieToDB(movie)); // Simpan offline
            updateStatusIndicator('Menampilkan data terbaru.', 'online');
        } catch (error) {
            console.warn('Gagal mengambil dari jaringan, coba dari DB...', error);
            try {
                const offlineMovies = await getMoviesFromDB('avengers');
                if (offlineMovies.length > 0) {
                    displayMovies(offlineMovies);
                    updateStatusIndicator('Anda offline. Menampilkan data dari cache.', 'offline');
                } else {
                    showPlaceholder('Gagal memuat rekomendasi. Periksa koneksi internet Anda.');
                }
            } catch {
                showPlaceholder('Gagal mengakses data offline.');
            }
        }
    };

    // --- TANGANI PENCARIAN FILM OLEH USER ---
    const handleSearch = async (e) => {
        e.preventDefault();
        const searchTerm = searchInput.value.trim();
        if (!searchTerm) return;

        sectionTitle.textContent = `Hasil Pencarian untuk "${searchTerm}"`;
        showPlaceholder('Mencari film...');
        movieContainer.innerHTML = '';

        try {
            const data = await fetchFromAPI(`s=${searchTerm}`);
            displayMovies(data.Search);
            data.Search.forEach(movie => saveMovieToDB(movie));
            updateStatusIndicator('Menampilkan hasil pencarian terbaru.', 'online');
            backToHomeContainer.classList.remove('hidden');
        } catch (error) {
            console.warn(`Gagal cari "${searchTerm}", coba dari DB...`);
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
            } catch {
                showPlaceholder('Gagal mengakses data offline.');
            }
        }
    };

    // --- TAMPILKAN PESAN SAAT LOADING / TIDAK ADA HASIL ---
    const showPlaceholder = (message) => {
        placeholder.textContent = message;
        placeholder.style.display = 'block';
    };

    const hidePlaceholder = () => {
        placeholder.style.display = 'none';
    };

    // --- TAMPILKAN KARTU FILM DI HALAMAN ---
    const displayMovies = (movies) => {
        movieContainer.innerHTML = '';
        if (!movies || movies.length === 0) {
            showPlaceholder('Tidak ada film yang cocok dengan pencarian Anda.');
            return;
        }
        hidePlaceholder();

        movies.forEach(movie => {
            const movieElement = document.createElement('div');
            movieElement.className = 'bg-white dark:bg-gray-800 ...';
            const posterUrl = movie.Poster === 'N/A' 
                ? `https://placehold.co/400x600/1f2937/ffffff?text=${encodeURIComponent(movie.Title)}`
                : movie.Poster;
            movieElement.innerHTML = `
                <div class="relative">
                    <img src="${posterUrl}" alt="Poster ${movie.Title}" class="..." onerror="this.src='https://placehold.co/400x600/1f2937/ffffff?text=Image+Error';">
                    <div class="..."> <p class="text-white ...">Lihat Detail</p> </div>
                </div>
                <div class="p-4">
                    <h3 class="text-lg font-bold truncate">${movie.Title}</h3>
                    <p class="text-gray-600 dark:text-gray-400">${movie.Year}</p>
                </div>`;
            movieElement.addEventListener('click', () => showMovieDetails(movie.imdbID));
            movieContainer.appendChild(movieElement);
        });
    };

    // --- MENAMPILKAN DETAIL FILM DI MODAL ---
    const showMovieDetails = async (imdbID) => {
        modal.classList.remove('hidden');
        modalBody.innerHTML = '<p class="text-center p-8">Memuat detail...</p>';
        setTimeout(() => modalContent.classList.remove('scale-95'), 10);

        try {
            let details = await getMovieDetailsFromDB(imdbID);
            if (!details || !details.Plot) {
                details = await fetchFromAPI(`i=${imdbID}&plot=full`);
                saveMovieToDB(details); // Simpan detail lengkap
            }
            populateModal(details);
        } catch {
            modalBody.innerHTML = `<p class="text-center p-8 text-red-500">Gagal memuat detail. Coba lagi saat online.</p>`;
        }
    };

    // --- ISI MODAL DENGAN DATA FILM ---
    const populateModal = (movie) => {
        const posterUrl = movie.Poster === 'N/A' ? `https://placehold.co/...` : movie.Poster;
        const ratingsHTML = (movie.Ratings && movie.Ratings.length > 0)
            ? movie.Ratings.map(rating => `<div class="..."><span>${rating.Source}</span><span>${rating.Value}</span></div>`).join('')
            : '<p>Rating tidak tersedia.</p>';

        modalBody.innerHTML = `...`; // Isi HTML detail film
    };

    const closeModal = () => {
        modal.classList.add('hidden');
        modalContent.classList.add('scale-95');
    };

    // --- DAFTARKAN SERVICE WORKER UNTUK PWA ---
    const registerServiceWorker = () => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('Service Worker berhasil didaftarkan.', reg))
                    .catch(err => console.error('Pendaftaran Service Worker gagal:', err));
            });
        }
    };

    // --- HANDLE EVENT INSTALASI PWA ---
    const handleInstallPrompt = (e) => {
        e.preventDefault(); // Blokir prompt default
        deferredPrompt = e;
        installButton.classList.remove('hidden'); // Tampilkan tombol install
    };

    const installApp = () => {
        if (!deferredPrompt) return;
        installButton.classList.add('hidden');
        deferredPrompt.prompt(); // Tampilkan prompt install
        deferredPrompt.userChoice.then(choiceResult => {
            console.log('Pilihan pengguna:', choiceResult.outcome);
            deferredPrompt = null;
        });
    };

    // --- INDIKATOR STATUS KONEKSI ---
    const updateStatusIndicator = (message, status) => {
        statusIndicator.textContent = message;
        statusIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');

        if (status === 'online') {
            statusIndicator.classList.add('bg-green-500');
            setTimeout(hideStatusIndicator, 3000);
        } else if (status === 'offline') {
            statusIndicator.classList.add('bg-red-500');
        } else {
            statusIndicator.classList.add('bg-yellow-500');
        }

        statusIndicator.classList.remove('-translate-y-full');
    };

    const hideStatusIndicator = () => {
        statusIndicator.classList.add('-translate-y-full');
    };

    const handleConnectionChange = () => {
        if (navigator.onLine) {
            updateStatusIndicator('Anda kembali online.', 'online');
            loadInitialRecommendations();
        } else {
            updateStatusIndicator('Anda sekarang offline.', 'offline');
        }
    };

    // --- DAFTAR EVENT LISTENERS UNTUK INTERAKSI USER ---
    searchForm.addEventListener('submit', handleSearch);
    backToHomeButton.addEventListener('click', loadInitialRecommendations);
    modalCloseButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    installButton.addEventListener('click', installApp);
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);

    // --- MULAI APLIKASI ---
    const initializeApp = () => {
        registerServiceWorker();
        initDB();
        if (!navigator.onLine) {
            updateStatusIndicator('Anda sedang offline.', 'offline');
        }
    };

    initializeApp(); // Jalankan app saat pertama dimuat
});
