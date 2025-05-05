const CACHE_NAME = 'jadwal-kuliah-cache-v1'; // Ubah versi jika ada pembaruan aset
const urlsToCache = [
  '/', // Cache halaman root
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  // Tambahkan path ke ikon Anda di sini, contoh:
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Tambahkan URL font atau aset eksternal lain jika perlu (hati-hati dengan CORS)
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js'
  // Mungkin perlu menambahkan URL font Awesome jika tidak inline di CSS
];

// Instalasi Service Worker: Cache aset inti
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch(error => console.error('Service Worker: Failed to cache app shell:', error))
  );
});

// Aktivasi Service Worker: Hapus cache lama
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME) // Filter cache yang bukan versi saat ini
          .map(name => caches.delete(name)) // Hapus cache lama
      );
    })
  );
});

// Fetch Event: Sajikan dari cache jika tersedia (Cache First Strategy untuk app shell)
self.addEventListener('fetch', event => {
  // Kita tidak cache request API data jadwal di sini untuk versi awal ini
  if (event.request.url.includes(API_URL)) {
    return; // Biarkan request API langsung ke network
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Jika ada di cache, kembalikan dari cache. Jika tidak, fetch dari network.
        return response || fetch(event.request);
      })
  );
});