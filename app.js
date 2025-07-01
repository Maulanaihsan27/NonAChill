document.addEventListener('DOMContentLoaded', () => {

    // --- SELEKTOR DOM & VARIABEL GLOBAL ---
    const apiKey = 'thewdb'; // Kunci API untuk OMDb
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

    let deferredPrompt; // Untuk event instalasi PWA
    let db; // Untuk instance IndexedDB

    // --- INISIALISASI INDEXEDDB ---
    const initDB = () => {
        const dbName = 'MoviePWA_DB';
        const storeName = 'movies';
        const request = indexedDB.open(dbName, 1);

        request.onerror = (event) => console.error('Error saat membuka IndexedDB:', event.target.errorCode);
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database IndexedDB berhasil dibuka.');
            // Setelah DB siap, muat data awal
            loadInitialRecommendations();
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                const objectStore = db.createObjectStore(storeName, { keyPath: 'imdbID' });
                objectStore.createIndex('Title', 'Title', { unique: false });
                console.log('Object store "movies" berhasil dibuat.');
            }
        };
    };

    // --- FUNGSI DATABASE (CRUD) ---
    const saveMovieToDB = (movieData) => {
        if (!db) return;
        const transaction = db.transaction(['movies'], 'readwrite');
        const objectStore = transaction.objectStore('movies');
        // Menggunakan put() agar data diperbarui jika sudah ada
        objectStore.put(movieData);
    };

    const getMoviesFromDB = (searchQuery) => {
        return new Promise((resolve, reject) => {
            if (!db) return reject('Database tidak siap.');
            const transaction = db.transaction(['movies'], 'readonly');
            const request = transaction.objectStore('movies').getAll();
            request.onerror = (event) => reject('Error mengambil data dari DB:', event.target.errorCode);
            request.onsuccess = (event) => {
                const allMovies = event.target.result;
                if (searchQuery) {
                    // Filter berdasarkan judul jika ada query pencarian
                    const filtered = allMovies.filter(m => m.Title.toLowerCase().includes(searchQuery.toLowerCase()));
                    resolve(filtered);
                } else {
                    resolve(allMovies); // Kembalikan semua jika tidak ada query
                }
            };
        });
    };
    
    const getMovieDetailsFromDB = (imdbID) => {
        return new Promise((resolve) => {
            if (!db) return resolve(null);
            const request = db.transaction(['movies']).objectStore('movies').get(imdbID);
            request.onsuccess = e => resolve(e.target.result);
            request.onerror = () => resolve(null);
        });
    };

    // --- LOGIKA UTAMA APLIKASI ---
    const fetchFromAPI = async (params) => {
        const url = `https://www.omdbapi.com/?apikey=${apiKey}&${params}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok.');
        const data = await response.json();
        if (data.Response === 'False') throw new Error(data.Error || 'Data tidak ditemukan.');
        return data;
    };

    const loadInitialRecommendations = async () => {
        sectionTitle.textContent = 'Rekomendasi Film';
        showPlaceholder('Memuat rekomendasi film...');
        movieContainer.innerHTML = '';
        backToHomeContainer.classList.add('hidden');

        try {
            const data = await fetchFromAPI('s=avengers');
            displayMovies(data.Search);
            data.Search.forEach(movie => saveMovieToDB(movie));
            updateStatusIndicator('Menampilkan data terbaru.', 'online');
        } catch (error) {
            console.warn('Gagal mengambil rekomendasi dari jaringan, mencoba dari DB lokal...', error);
            try {
                const offlineMovies = await getMoviesFromDB('avengers');
                if (offlineMovies.length > 0) {
                    displayMovies(offlineMovies);
                    updateStatusIndicator('Anda offline. Menampilkan data dari cache.', 'offline');
                } else {
                    showPlaceholder('Gagal memuat rekomendasi. Periksa koneksi internet Anda.');
                }
            } catch (dbError) {
                showPlaceholder('Gagal mengakses data offline.');
            }
        }
    };

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
    const showPlaceholder = (message) => {
        placeholder.textContent = message;
        placeholder.style.display = 'block';
    };

    const hidePlaceholder = () => {
        placeholder.style.display = 'none';
    };

    const displayMovies = (movies) => {
        movieContainer.innerHTML = '';
        if (!movies || movies.length === 0) {
            showPlaceholder('Tidak ada film yang cocok dengan pencarian Anda.');
            return;
        }
        hidePlaceholder();
        movies.forEach(movie => {
            const movieElement = document.createElement('div');
            movieElement.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 cursor-pointer group';
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
            movieElement.addEventListener('click', () => showMovieDetails(movie.imdbID));
            movieContainer.appendChild(movieElement);
        });
    };

    const showMovieDetails = async (imdbID) => {
        modal.classList.remove('hidden');
        modalBody.innerHTML = '<p class="text-center p-8">Memuat detail...</p>';
        setTimeout(() => modalContent.classList.remove('scale-95'), 10);

        try {
            // Coba ambil dari DB dulu
            let details = await getMovieDetailsFromDB(imdbID);
            // Jika data di DB tidak lengkap (misal, belum ada Plot), fetch dari API
            if (!details || !details.Plot) {
                console.log('Detail tidak lengkap di DB, mengambil dari jaringan...');
                details = await fetchFromAPI(`i=${imdbID}&plot=full`);
                saveMovieToDB(details); // Simpan/update detail lengkap ke DB
            }
            populateModal(details);
        } catch (error) {
            console.error("Gagal menampilkan detail:", error);
            modalBody.innerHTML = `<p class="text-center p-8 text-red-500">Gagal memuat detail. Coba lagi saat online.</p>`;
        }
    };
    
    const populateModal = (movie) => {
        const posterUrl = movie.Poster === 'N/A' ? `https://placehold.co/400x600/1f2937/ffffff?text=${encodeURIComponent(movie.Title)}` : movie.Poster;
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

    const closeModal = () => {
        modal.classList.add('hidden');
        modalContent.classList.add('scale-95');
    };

    // --- LOGIKA PWA & STATUS KONEKSI ---
    const registerServiceWorker = () => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('Service Worker berhasil didaftarkan.', reg))
                    .catch(err => console.error('Pendaftaran Service Worker gagal:', err));
            });
        }
    };

    const handleInstallPrompt = (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installButton.classList.remove('hidden');
    };

    const installApp = () => {
        if (!deferredPrompt) return;
        installButton.classList.add('hidden');
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(choiceResult => {
            console.log('Pilihan pengguna untuk instalasi:', choiceResult.outcome);
            deferredPrompt = null;
        });
    };

    const updateStatusIndicator = (message, status) => {
        statusIndicator.textContent = message;
        // Hapus kelas warna sebelumnya
        statusIndicator.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');
        
        if (status === 'online') {
            statusIndicator.classList.add('bg-green-500');
            // Sembunyikan notifikasi setelah beberapa detik jika online
            setTimeout(hideStatusIndicator, 3000);
        } else if (status === 'offline') {
            statusIndicator.classList.add('bg-red-500');
        } else {
            statusIndicator.classList.add('bg-yellow-500');
        }
        
        statusIndicator.classList.remove('-translate-y-full'); // Tampilkan
    };

    const hideStatusIndicator = () => {
        statusIndicator.classList.add('-translate-y-full'); // Sembunyikan
    };

    const handleConnectionChange = () => {
        if (navigator.onLine) {
            updateStatusIndicator('Anda kembali online.', 'online');
            loadInitialRecommendations(); // Muat ulang data saat kembali online
        } else {
            updateStatusIndicator('Anda sekarang offline.', 'offline');
        }
    };

    // --- EVENT LISTENERS ---
    searchForm.addEventListener('submit', handleSearch);
    backToHomeButton.addEventListener('click', loadInitialRecommendations);
    modalCloseButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    installButton.addEventListener('click', installApp);
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);

    // --- INISIALISASI APLIKASI ---
    const initializeApp = () => {
        registerServiceWorker();
        initDB();
        // Cek status koneksi saat aplikasi pertama kali dimuat
        if (!navigator.onLine) {
            updateStatusIndicator('Anda sedang offline.', 'offline');
        }
    };

    initializeApp();
});
