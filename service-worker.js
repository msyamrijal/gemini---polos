const CACHE_NAME = 'jadwal-kuliah-cache-v1'; // Ubah versi jika ada pembaruan aset
const ACTUAL_API_URL_STRING = 'https://script.google.com/macros/s/AKfycby9sPywic_2ifeYBzE3dQMHfrwkR4-fQv-bNx74HMduvcq5Rr4r9MY6GGEYNqI44WRI/exec'; // URL API Anda
const urlsToCache = [
  '/', // Cache halaman root
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  // Path ke ikon yang sudah disederhanakan:
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
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
  if (event.request.url.startsWith(ACTUAL_API_URL_STRING)) {
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

// Push Event: Menerima pesan push dari server
self.addEventListener('push', event => {
  console.log('Service Worker: Push received.');
  const options = {
    body: 'Ada pembaruan jadwal baru!', // Default message
    icon: '/icons/icon-192.png', // Icon untuk notifikasi
    badge: '/icons/icon-72.png', // Badge icon (opsional, untuk Android)
    vibrate: [200, 100, 200], // Pola getar (opsional)
    data: { // Data tambahan yang bisa diakses saat notifikasi diklik
      url: '/', // URL yang akan dibuka saat notifikasi diklik
      // Anda bisa menambahkan data jadwal spesifik di sini jika dikirim dari backend
    },
    actions: [ // Tombol aksi (opsional)
      // { action: 'open', title: 'Buka Jadwal' },
      // { action: 'close', title: 'Tutup' }
    ]
  };

  if (event.data) {
    try {
      const data = event.data.json();
      console.log('Push data:', data);
      options.body = data.message || options.body; // Gunakan pesan dari data jika ada
      if (data.url) options.data.url = data.url; // Gunakan URL dari data jika ada
    } catch (e) {
      console.error('Failed to parse push data:', e);
      options.body = event.data.text(); // Fallback to plain text
    }
  }

  event.waitUntil(self.registration.showNotification('Jadwal Kuliah', options));
});

// Notification Click Event: Menangani klik pada notifikasi
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked.');
  event.notification.close(); // Tutup notifikasi setelah diklik

  const clickData = event.notification.data;
  const urlToOpen = clickData && clickData.url ? clickData.url : '/'; // Default to root

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // Cari window yang sudah terbuka dengan URL yang sama
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus(); // Fokus pada window yang sudah ada
        }
      }
      // Jika tidak ada window yang cocok, buka window baru
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});