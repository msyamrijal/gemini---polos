// app.js
const API_URL = 'https://script.google.com/macros/s/AKfycby9sPywic_2ifeYBzE3dQMHfrwkR4-fQv-bNx74HMduvcq5Rr4r9MY6GGEYNqI44WRI/exec';

// VAPID Public Key (Ganti dengan kunci publik VAPID Anda)
// Anda perlu membuat pasangan kunci VAPID (publik dan privat).
// Kunci publik ini digunakan oleh browser untuk mengenkripsi pesan.
// Kunci privat digunakan oleh server Anda (Apps Script) untuk menandatangani pesan.
//
// PENTING: Kunci VAPID ini harus unik untuk aplikasi Anda.
// Jangan gunakan kunci contoh di produksi.
// Anda bisa menghasilkan kunci VAPID menggunakan library seperti web-push (Node.js) atau online generator.
// Contoh: https://web-push-codelab.glitch.me/ atau npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = 'BIhgLx2GBXHAF3KDIkYvuB90ypRDLth5sT6npJYc28j3gfTeOiggSN-1URWXSNNaNt7lfWAzedOwJ5OCEBGAvG8'; // <--- PASTIKAN INI KUNCI PUBLIK ANDA
// VAPID_PRIVATE_KEY TIDAK BOLEH ADA DI FRONTEND (app.js)

// Elemen DOM
const elements = {
    // Main controls (now in popup menu)
    searchInput: document.getElementById('searchInput'),
    institutionFilter: document.getElementById('institutionFilter'),
    themeToggleBtn: document.getElementById('themeToggle'),
    notificationToggleBtn: document.getElementById('notificationToggleBtn'), // New notification button
    // searchToggleBtn: document.getElementById('searchToggleBtn'), // Removed
    gridViewBtn: document.getElementById('gridViewBtn'),
    calendarViewBtn: document.getElementById('calendarViewBtn'),
    driveToggleBtn: document.getElementById('driveToggleBtn'), // Drive button
    driveDropdown: document.getElementById('driveDropdown'),   // Drive dropdown

    // Other elements
    scheduleGrid: document.getElementById('scheduleGrid'),
    loading: document.getElementById('loading'),
    emptyState: document.getElementById('emptyState'),
    modal: document.getElementById('genericModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalBody: document.getElementById('modalBody'),
    closeModalBtn: document.querySelector('.close-modal'),
    modalOverlay: document.querySelector('.modal-overlay'),
    calendarView: document.getElementById('calendarView'),

    // Popup menu elements
    menuToggle: document.querySelector('.menu-toggle'),
    floatingMenu: document.querySelector('.floating-menu'),
    menuContent: document.querySelector('.menu-content'),

    // Install Prompt elements
    installPopup: document.getElementById('installPopup'),
    installBtn: document.getElementById('installBtn'),
    dismissInstallBtn: document.getElementById('dismissInstallBtn')
};

let allSchedules = [];
let initialLoad = true; // Flag for initial load animation
let currentView = 'grid'; // Track current view ('grid' or 'calendar')
let calendarInstance = null; // To hold the FullCalendar instance

// Variables for dragging the floating menu
let isDragging = false;
let dragStartX, dragStartY;
let initialMenuX, initialMenuY;
let hasDragged = false; // Flag to differentiate click from drag
let deferredInstallPrompt = null; // To store the install prompt event

// ======================
// THEME MANAGEMENT
// ======================
const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
};

const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
};

const updateThemeIcon = (theme) => {
    const themeIcon = elements.themeToggleBtn.querySelector('.theme-icon');
    // Style changes handled by CSS based on data-theme attribute
};

// ======================
// DATA MANAGEMENT
// ======================
const fetchData = async () => {
    try {
        showLoading();
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const rawData = await response.json(); // Data directly from Google Sheet

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to beginning of today

        // Process and sort data
        allSchedules = rawData
            .map(rawItem => {
                const peserta = [];
                // Collect participants from Peserta 1 to Peserta 10 columns
                for (let i = 1; i <= 10; i++) {
                    const pesertaField = rawItem[`Peserta ${i}`]; // Access fields like 'Peserta 1', 'Peserta 2', etc.
                    if (pesertaField && String(pesertaField).trim() !== '') {
                        peserta.push(String(pesertaField).trim());
                    }
                }
                return {
                    ID: rawItem.ID, // Assuming ID is a direct mapping
                    Institusi: rawItem.Institusi,
                    Mata_Pelajaran: rawItem.Mata_Pelajaran,
                    Tanggal: rawItem.Tanggal,
                    Peserta: peserta, // This is now an array of participant names
                    Materi_Diskusi: rawItem.Materi_Diskusi,
                    // TanggalDate will be added in a subsequent step
                };
            })
            .filter(item => {
                // Basic validation: Ensure essential fields exist and date is valid.
                // item.Peserta will always be an array here, even if empty.
                return item.Tanggal && item.Institusi && item.Mata_Pelajaran && !isNaN(new Date(item.Tanggal).getTime());
            })
            .map(item => ({ ...item, TanggalDate: new Date(item.Tanggal) })) // Pre-convert date for sorting/filtering
            .filter(item => item.TanggalDate >= today)
            .sort((a, b) => a.TanggalDate - b.TanggalDate);
        initFilters();
        filterSchedules(); // Initial render based on default filters
        attachDynamicListeners();

    } catch (error) {
        console.error('Fetch Error:', error);
        showError('Gagal memuat data jadwal. Periksa koneksi Anda atau coba lagi nanti.');
    } finally {
        hideLoading();
        initialLoad = false; // Mark initial load as complete
    }
};

// ======================
// FILTER SYSTEM
// ======================
const initFilters = () => {
    // Use a Set for unique institutions and sort them alphabetically
    const institutions = [...new Set(allSchedules.map(item => item.Institusi))].sort((a, b) => a.localeCompare(b));
    const filterSelect = elements.institutionFilter;

    // Clear existing options (except the default "Semua Institusi")
    filterSelect.length = 1; // Keep the first option

    // Add new options
    institutions.forEach(inst => {
        const option = document.createElement('option');
        option.value = inst;
        option.textContent = inst;
        filterSelect.appendChild(option);
    });

    // Add event listeners only once
    if (!filterSelect.dataset.listenerAttached) {
        elements.searchInput.addEventListener('input', debounce(filterSchedules, 300)); // Debounce search input
        filterSelect.addEventListener('change', filterSchedules);
        filterSelect.dataset.listenerAttached = 'true';
    }
};

const filterSchedules = () => {
    const searchTerm = elements.searchInput.value.toLowerCase().trim();
    const selectedInstitution = elements.institutionFilter.value;

    const filtered = allSchedules.filter(item => {
        // Combine relevant fields into a single string for searching
        const searchableText = [
            item.Institusi,
            item.Mata_Pelajaran,
            item.Peserta.join(' '),
            item.Materi_Diskusi || '' // Include Materi Diskusi in search, handle if it's missing
        ].join(' ').toLowerCase();

        const matchesSearch = searchTerm === '' || searchableText.includes(searchTerm);
        const matchesInstitution = selectedInstitution === 'all' || item.Institusi === selectedInstitution;

        return matchesSearch && matchesInstitution;
    });

    // Render based on the current view
    if (currentView === 'grid') {
        renderSchedules(filtered);
    } else {
        renderCalendar(filtered);
    }
    updateEmptyStateVisibility(filtered.length === 0);
};

// ======================
// RENDERING
// ======================
const renderSchedules = (data) => {
    elements.scheduleGrid.innerHTML = ''; // Clear previous results

    if (data.length === 0) {
        showEmptyState();
        hideLoading(); // Ensure loading is hidden
        return;
    }

    const fragment = document.createDocumentFragment();
    data.forEach(item => {
        const card = createScheduleCard(item);
        fragment.appendChild(card);
    });
    elements.scheduleGrid.appendChild(fragment);
};

// Helper function to convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

const createScheduleCard = (item) => {
    const card = document.createElement('article');
    card.className = 'schedule-card';
    card.innerHTML = `
        <div class="card-header">
            <h3 class="course-title clickable" data-entity="Mata_Pelajaran">${item.Mata_Pelajaran}</h3>
            <span class="date-display clickable" data-entity="Tanggal">${formatDate(item.Tanggal)}</span>
        </div>
        <div class="institute clickable" data-entity="Institusi">${item.Institusi}</div>
        ${item.Materi_Diskusi ? `
            <div class="discussion-topic">
                <strong>Materi:</strong> ${item.Materi_Diskusi}
            </div>` : ''}
        <div class="participants">
            ${item.Peserta.map(peserta => `
                <span class="participant-tag clickable" data-entity="Peserta">${peserta}</span>
            `).join('')}
        </div>
    `;
    return card;
};

const renderCalendar = (data) => {
   if (!calendarInstance) return; // Don't render if calendar not initialized

   const events = data.map(item => ({
       title: item.Mata_Pelajaran,
       start: item.TanggalDate, // Use the pre-converted Date object
       extendedProps: { // Store original item data including Materi Diskusi
           Materi_Diskusi: item.Materi_Diskusi,
           itemData: item
       },
   }));

   calendarInstance.removeAllEvents(); // Clear previous events
   calendarInstance.addEventSource(events);
   calendarInstance.render(); // Re-render the calendar
};


// ======================
// MODAL SYSTEM
// ======================
const showGenericModal = (title, data) => {
    elements.modalTitle.textContent = title;
    elements.modalBody.innerHTML = generateModalContent(data);
    elements.modal.style.display = 'block'; // Show modal
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
};

const hideModal = () => {
    elements.modal.style.display = 'none';
    document.body.style.overflow = ''; // Restore background scrolling
};

const generateModalContent = (data) => {
    if (!data || data.length === 0) {
        return '<p class="no-data">Tidak ada data jadwal terkait yang ditemukan.</p>';
    }

    return data.map(item => `
        <div class="modal-item">
            <div class="card-header">
                <h4 class="course-title">${item.Mata_Pelajaran}</h4>
            </div>
             <div class="modal-meta">
                <span class="institute">${item.Institusi}</span>
                <span class="date-display">${formatDate(item.Tanggal)}</span>
            </div>
            ${item.Materi_Diskusi ? `
            <div class="discussion-topic modal-discussion">
                <strong>Materi Diskusi:</strong><br>${item.Materi_Diskusi}
            </div>` : ''}
            <div class="participants">
                ${item.Peserta.map(p => `<span class="participant-tag">${p}</span>`).join('')}
            </div>
        </div>
    `).join('');
};

// ======================
// EVENT HANDLERS
// ======================
const handleEntityClick = (element) => {
    const entityType = element.dataset.entity;
    const value = element.textContent;
    let filterProperty = entityType;
    let modalTitlePrefix = '';

    let filteredData;
    if (entityType === 'Peserta') {
        filteredData = allSchedules.filter(item => item.Peserta.includes(value));
        modalTitlePrefix = `Jadwal untuk ${value}`;
    } else if (entityType === 'Tanggal') {
         const clickedDateStr = formatDate(value);
         filteredData = allSchedules.filter(item => formatDate(item.Tanggal) === clickedDateStr);
         modalTitlePrefix = `Jadwal pada ${value}`;
    }
     else { // Mata_Pelajaran or Institusi
        filteredData = allSchedules.filter(item => item[filterProperty] === value);
        modalTitlePrefix = `Jadwal ${value}`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureFilteredData = filteredData.filter(item => item.TanggalDate >= today);

    showGenericModal(modalTitlePrefix, futureFilteredData);
};


// Use event delegation for dynamically added elements
const attachDynamicListeners = () => {
    document.body.addEventListener('click', (e) => {
        const target = e.target;

        if (target.classList.contains('clickable') && target.dataset.entity) {
            handleEntityClick(target);
        }

        if (target === elements.modalOverlay || target === elements.closeModalBtn || target.closest('.close-modal')) {
             hideModal();
        }

        if (target.classList.contains('drive-link') && elements.driveDropdown) {
            elements.driveDropdown.classList.remove('active');
        }
    });
};

// ======================
// NOTIFICATION & PUSH SUBSCRIPTION
// ======================
const checkNotificationPermission = () => {
    console.log('Checking notification permission...');
    if (!('Notification' in window)) {
        console.warn("Browser tidak mendukung Notifikasi.");
        return 'unsupported';
    }
    console.log('Notification.permission:', Notification.permission);
    return Notification.permission; // 'default', 'granted', 'denied'
};

const updateNotificationButton = (permission) => {
    if (!elements.notificationToggleBtn) return;

    const icon = elements.notificationToggleBtn.querySelector('i');
    if (!icon) return; // Pastikan ikon ada
    const text = elements.notificationToggleBtn.childNodes[1]; // Get the text node

    if (permission === 'granted') {
        icon.className = 'fas fa-bell'; // Bell icon
        text.nodeValue = ' Notifikasi Aktif';
        elements.notificationToggleBtn.disabled = true; // Disable button if granted
        elements.notificationToggleBtn.style.opacity = 0.7;
        elements.notificationToggleBtn.style.cursor = 'default';
    } else if (permission === 'denied') {
        icon.className = 'fas fa-bell-slash'; // Bell slash icon
        text.nodeValue = ' Notifikasi Diblokir';
        elements.notificationToggleBtn.disabled = true; // Disable if denied
        elements.notificationToggleBtn.style.opacity = 0.7;
        elements.notificationToggleBtn.style.cursor = 'default';
        elements.notificationToggleBtn.title = 'Anda telah memblokir notifikasi. Harap ubah pengaturan browser Anda.';
    } else if (permission === 'unsupported') {
        icon.className = 'fas fa-bell-slash';
        text.nodeValue = ' Notifikasi Tdk Didukung';
        elements.notificationToggleBtn.disabled = true;
        elements.notificationToggleBtn.style.opacity = 0.7;
        elements.notificationToggleBtn.style.cursor = 'default';
        elements.notificationToggleBtn.title = 'Anda telah memblokir notifikasi. Harap ubah pengaturan browser Anda.';
    } else { // 'default' or 'unsupported'
        icon.className = 'fas fa-bell'; // Bell icon
        text.nodeValue = ' Aktifkan Notifikasi';
        elements.notificationToggleBtn.disabled = false; // Enable button
        elements.notificationToggleBtn.style.opacity = 1;
        elements.notificationToggleBtn.style.cursor = 'pointer';
        elements.notificationToggleBtn.title = 'Klik untuk mengaktifkan notifikasi jadwal.';
    }
};

const subscribeUserToPush = async () => {
    console.log('Attempting to subscribe user to push...');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn("Push notifications tidak didukung oleh browser ini.");
        updateNotificationButton('unsupported');
        return;
    }

    console.log('Meminta izin notifikasi...');
    const permission = await Notification.requestPermission();
    console.log('Izin notifikasi yang diberikan:', permission);
    updateNotificationButton(permission);

    if (permission !== 'granted') {
        console.warn('Izin notifikasi tidak diberikan.');
        return;
    }

    console.log('Izin diberikan, melanjutkan proses langganan...');
    try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
            console.log('User is already subscribed.');
            // sendSubscriptionToBackend(existingSubscription); // Optionally re-send
            updateNotificationButton('granted'); // Pastikan tombol update jika sudah subscribe
            return;
        }

        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey // Ini harus Uint8Array
        });
        console.log('Pengguna berhasil berlangganan:', subscription);
        await sendSubscriptionToBackend(subscription);
    } catch (error) {
        console.error('Failed to subscribe the user: ', error);
    }
};

const sendSubscriptionToBackend = async (subscription) => {
    const subscriptionData = subscription.toJSON();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'subscribe',
                password: 'admin123', // Use your actual API password
                subscription: subscriptionData
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Subscription sent to backend:', result);
        if (result.status === 'success') {
             console.log('Subscription successfully stored on backend.');
        } else {
             console.error('Backend reported error storing subscription:', result.message);
        }

    } catch (error) {
        console.error('Failed to send subscription to backend:', error);
    }
};

// ======================
// UTILITIES
// ======================
const formatDate = (dateString) => {
    const date = (dateString instanceof Date) ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) return 'Tanggal tidak valid';

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const inputDateOnly = new Date(date); inputDateOnly.setHours(0, 0, 0, 0);

    if (inputDateOnly.getTime() === today.getTime()) return 'Hari Ini';
    if (inputDateOnly.getTime() === tomorrow.getTime()) return 'Besok';

    const options = {
        weekday: 'long', day: 'numeric', month: 'long',
        year: (inputDateOnly.getFullYear() !== today.getFullYear()) ? 'numeric' : undefined
    };
    return inputDateOnly.toLocaleDateString('id-ID', options);
};

const showLoading = () => {
    elements.loading.classList.remove('hidden');
    elements.loading.style.display = 'flex';
    elements.emptyState.classList.add('hidden');
    elements.scheduleGrid.style.display = 'none';
    elements.calendarView.style.display = 'none';
};

const hideLoading = () => {
    elements.loading.classList.add('hidden');
    elements.loading.style.display = 'none';
    if (currentView === 'grid') {
        elements.scheduleGrid.style.display = 'grid';
    } else {
        elements.calendarView.style.display = 'block';
    }
};

const showEmptyState = () => {
    elements.emptyState.classList.remove('hidden');
    elements.emptyState.style.display = 'flex';
    elements.scheduleGrid.style.display = 'none';
    elements.calendarView.style.display = 'none';
    elements.emptyState.innerHTML = `
        <i class="fas fa-ghost empty-icon"></i>
        <h3>Oops! Jadwal tidak ditemukan</h3>
        <p>Coba kata kunci atau filter yang berbeda.</p>
    `;
};

const hideEmptyState = () => {
    elements.emptyState.classList.add('hidden');
    elements.emptyState.style.display = 'none';
};

const updateEmptyStateVisibility = (isEmpty) => {
  if (isEmpty) showEmptyState();
  else hideEmptyState();
};

const showError = (message = 'Terjadi kesalahan.') => {
    hideLoading();
    elements.scheduleGrid.style.display = 'none';
    elements.calendarView.style.display = 'none';
    elements.emptyState.classList.remove('hidden');
    elements.emptyState.style.display = 'flex';
    elements.emptyState.innerHTML = `
        <i class="fas fa-exclamation-triangle empty-icon" style="color: #e74c3c;"></i>
        <h3>Terjadi Kesalahan</h3>
        <p>${message}</p>
    `;
};

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ======================
// INITIALIZATION
// ======================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initCalendar();
    fetchData();
    registerServiceWorker();

    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    if (elements.notificationToggleBtn) {
        elements.notificationToggleBtn.addEventListener('click', subscribeUserToPush);
    }

    if (elements.driveToggleBtn && elements.driveDropdown) {
        elements.driveToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.driveDropdown.classList.toggle('active');
        });
    }

    if (elements.menuToggle && elements.floatingMenu) {
        elements.floatingMenu.classList.add('welcome-animation');
        if (elements.driveDropdown) elements.driveDropdown.classList.remove('active');
        setTimeout(() => {
            elements.floatingMenu.classList.remove('welcome-animation');
            const menuWidth = elements.floatingMenu.offsetWidth || 50;
            elements.floatingMenu.style.top = '20px';
            elements.floatingMenu.style.left = `${window.innerWidth - menuWidth - 20}px`;
            setupDraggableMenu();
        }, 3000);
    }

    document.addEventListener('click', (e) => {
        if (elements.driveDropdown && elements.driveDropdown.classList.contains('active') &&
            !elements.driveDropdown.contains(e.target) &&
            !elements.driveToggleBtn.contains(e.target)) {
            elements.driveDropdown.classList.remove('active');
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.modal.style.display === 'block') {
            hideModal();
        }
    });

    elements.gridViewBtn.addEventListener('click', () => switchView('grid'));
    elements.calendarViewBtn.addEventListener('click', () => switchView('calendar'));

    setupInstallPrompt();
    updateNotificationButton(checkNotificationPermission());
});

// ======================
// DRAGGABLE MENU LOGIC
// ======================
const setupDraggableMenu = () => {
    const menuToggle = elements.menuToggle;
    const floatingMenu = elements.floatingMenu;

    const dragStart = (e) => {
        isDragging = true; hasDragged = false;
        menuToggle.style.cursor = 'grabbing';
        const event = e.type === 'touchstart' ? e.touches[0] : e;
        dragStartX = event.clientX; dragStartY = event.clientY;
        initialMenuX = floatingMenu.offsetLeft; initialMenuY = floatingMenu.offsetTop;
        document.addEventListener('mousemove', dragging);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchmove', dragging, { passive: false });
        document.addEventListener('touchend', dragEnd);
        e.preventDefault();
    };

    const dragging = (e) => {
        if (!isDragging) return; hasDragged = true;
        const event = e.type === 'touchmove' ? e.touches[0] : e;
        const dx = event.clientX - dragStartX; const dy = event.clientY - dragStartY;
        let newX = initialMenuX + dx; let newY = initialMenuY + dy;
        const menuWidth = floatingMenu.offsetWidth; const menuHeight = floatingMenu.offsetHeight;
        newX = Math.max(0, Math.min(newX, window.innerWidth - menuWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - menuHeight));
        floatingMenu.style.left = `${newX}px`; floatingMenu.style.top = `${newY}px`;
        e.preventDefault();
    };

    const dragEnd = () => {
        if (!isDragging) return; isDragging = false;
        menuToggle.style.cursor = 'pointer';
        document.removeEventListener('mousemove', dragging);
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchmove', dragging);
        document.removeEventListener('touchend', dragEnd);
        if (!hasDragged) floatingMenu.classList.toggle('active');
    };

    menuToggle.addEventListener('mousedown', dragStart);
    menuToggle.addEventListener('touchstart', dragStart);
    menuToggle.addEventListener('click', (e) => {
        if (hasDragged) { e.preventDefault(); e.stopPropagation(); }
    }, true);
};

// ======================
// CALENDAR FUNCTIONS
// ======================
const initCalendar = () => {
   if (calendarInstance) return;
   calendarInstance = new FullCalendar.Calendar(elements.calendarView, {
       initialView: 'dayGridMonth', locale: 'id',
       headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
       events: [], height: 'auto',
       eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
       eventClick: function(info) {
           const item = info.event.extendedProps.itemData;
           showGenericModal(`Detail: ${item.Mata_Pelajaran}`, [item]);
           info.jsEvent.preventDefault();
       }
   });
   calendarInstance.render();
};

const switchView = (view) => {
   if (view === currentView) return;
   currentView = view;
   elements.gridViewBtn.classList.toggle('active', view === 'grid');
   elements.calendarViewBtn.classList.toggle('active', view === 'calendar');
   elements.scheduleGrid.classList.toggle('active', view === 'grid');
   elements.calendarView.classList.toggle('active', view === 'calendar');
   elements.scheduleGrid.style.display = view === 'grid' ? 'grid' : 'none';
   elements.calendarView.style.display = view === 'calendar' ? 'block' : 'none';
   if (allSchedules.length > 0) filterSchedules();
};

// ======================
// SERVICE WORKER REGISTRATION
// ======================
const registerServiceWorker = () => {
  if (!('Notification' in window) || !('PushManager' in window)) {
      console.warn("Notifikasi atau Push API tidak didukung. Service Worker akan diregistrasi, tapi push tidak akan berfungsi.");
       if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/service-worker.js')
                // eslint-disable-next-line no-unused-vars
                .then(registration => console.log('ServiceWorker registration successful (push unsupported): ', registration.scope))
                .catch(error => console.log('ServiceWorker registration failed (push unsupported): ', error));
            });
        } else {
            console.log('Service Worker not supported by this browser.');
        }
      updateNotificationButton('unsupported');
      if (elements.notificationToggleBtn) {
          elements.notificationToggleBtn.title = 'Browser Anda tidak mendukung notifikasi push.';
      }
      return;
  }

  navigator.serviceWorker.ready.then(registration => {
      registration.pushManager.getSubscription().then(subscription => {
          if (subscription) updateNotificationButton('granted');
      });
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        // eslint-disable-next-line no-unused-vars
        .then(registration => console.log('ServiceWorker registration successful with scope: ', registration.scope))
        .catch(error => console.log('ServiceWorker registration failed: ', error));
    });
  }
};

// ======================
// PWA INSTALL PROMPT LOGIC
// ======================
const setupInstallPrompt = () => {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        console.log('`beforeinstallprompt` event was fired.');
        setTimeout(() => {
            if (deferredInstallPrompt && elements.installPopup && !window.matchMedia('(display-mode: standalone)').matches) {
                elements.installPopup.classList.remove('hidden');
            }
        }, 10000);
    });

    if (elements.installBtn) {
        elements.installBtn.addEventListener('click', async () => {
            if (!deferredInstallPrompt) return;
            elements.installPopup.classList.add('hidden');
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredInstallPrompt = null;
        });
    }

    if (elements.dismissInstallBtn) {
        elements.dismissInstallBtn.addEventListener('click', () => {
            elements.installPopup.classList.add('hidden');
        });
    }

    window.addEventListener('appinstalled', () => {
        console.log('PWA was installed');
        if (elements.installPopup) elements.installPopup.classList.add('hidden');
        deferredInstallPrompt = null;
    });
};