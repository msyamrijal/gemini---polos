// app.js
const API_URL = 'https://script.google.com/macros/s/AKfycby9sPywic_2ifeYBzE3dQMHfrwkR4-fQv-bNx74HMduvcq5Rr4r9MY6GGEYNqI44WRI/exec';

// Elemen DOM
const elements = {
    // Main controls (now in popup menu)
    searchInput: document.getElementById('searchInput'),
    institutionFilter: document.getElementById('institutionFilter'),
    themeToggleBtn: document.getElementById('themeToggle'),
    // searchToggleBtn: document.getElementById('searchToggleBtn'), // Removed
    gridViewBtn: document.getElementById('gridViewBtn'),
    calendarViewBtn: document.getElementById('calendarViewBtn'),
    
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
    menuContent: document.querySelector('.menu-content')
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
    // Optional: Add class for animation control if needed
    // themeIcon.style.transform = theme === 'dark' ? 'rotate(40deg)' : 'rotate(0deg)'; // Handled by CSS now
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
        const data = await response.json();

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to beginning of today

        // Process and sort data
        allSchedules = data
            .filter(item => {
                // Basic validation: Ensure essential fields exist and date is valid. Materi Diskusi is optional here.
                return item.Tanggal && item.Institusi && item.Mata_Pelajaran && item.Peserta && !isNaN(new Date(item.Tanggal).getTime());
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
            // Optionally add formatted date if needed for search
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

    // hideEmptyState(); // Handled by updateEmptyStateVisibility
    // hideLoading(); // Ensure loading is hidden - Handled elsewhere

    const fragment = document.createDocumentFragment();
    data.forEach(item => {
        const card = createScheduleCard(item);
        fragment.appendChild(card);
    });
    elements.scheduleGrid.appendChild(fragment);
};

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
       // Optional: Add colors based on institution or other factors
       // backgroundColor: getInstitutionColor(item.Institusi),
       // borderColor: getInstitutionColor(item.Institusi)
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
    // Focus management could be added here for accessibility
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

    // Prepare data based on clicked entity
    let filteredData;
    if (entityType === 'Peserta') {
        filteredData = allSchedules.filter(item => item.Peserta.includes(value));
        modalTitlePrefix = `Jadwal untuk ${value}`;
    } else if (entityType === 'Tanggal') {
        // Match by formatted date string if needed, or re-filter by date object
         const clickedDateStr = formatDate(value); // Assuming value is a parseable date string initially
         filteredData = allSchedules.filter(item => formatDate(item.Tanggal) === clickedDateStr);
         modalTitlePrefix = `Jadwal pada ${value}`;
    }
     else { // Mata_Pelajaran or Institusi
        filteredData = allSchedules.filter(item => item[filterProperty] === value);
        modalTitlePrefix = `Jadwal ${value}`;
    }

    // Filter out past schedules for the modal view as well (optional, depends on desired behavior)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureFilteredData = filteredData.filter(item => item.TanggalDate >= today);


    showGenericModal(modalTitlePrefix, futureFilteredData);
};


// Use event delegation for dynamically added elements
const attachDynamicListeners = () => {
    document.body.addEventListener('click', (e) => {
        const target = e.target;

        // Handle clicks on clickable entities within cards or modal
        if (target.classList.contains('clickable') && target.dataset.entity) {
            handleEntityClick(target);
        }

        // Close modal logic
        if (target === elements.modalOverlay || target === elements.closeModalBtn || target.closest('.close-modal')) {
             hideModal();
        }
    });
};

// ======================
// UTILITIES
// ======================
const formatDate = (dateString) => {
    // Check if dateString is already a Date object (from processing)
    const date = (dateString instanceof Date) ? dateString : new Date(dateString);

    if (isNaN(date.getTime())) {
        return 'Tanggal tidak valid'; // Handle invalid date strings
    }

    // Get today's and tomorrow's date at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const inputDateOnly = new Date(date);
    inputDateOnly.setHours(0, 0, 0, 0);

    // Check if the date is today or tomorrow
    if (inputDateOnly.getTime() === today.getTime()) {
        return 'Hari Ini';
    } else if (inputDateOnly.getTime() === tomorrow.getTime()) {
        return 'Besok';
    }

    const options = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: (inputDateOnly.getFullYear() !== today.getFullYear()) ? 'numeric' : undefined
    };
    return inputDateOnly.toLocaleDateString('id-ID', options);
};

const showLoading = () => {
    elements.loading.classList.remove('hidden');
    elements.loading.style.display = 'flex'; // Ensure display is correct
    elements.emptyState.classList.add('hidden');
    // Hide both view containers while loading
    elements.scheduleGrid.style.display = 'none';
    elements.calendarView.style.display = 'none';
};

const hideLoading = () => {
    elements.loading.classList.add('hidden');
     elements.loading.style.display = 'none';
     // Show the currently active view container
     if (currentView === 'grid') {
         elements.scheduleGrid.style.display = 'grid';
     } else {
         elements.calendarView.style.display = 'block';
     }
};

const showEmptyState = () => {
    elements.emptyState.classList.remove('hidden');
    elements.emptyState.style.display = 'flex'; // Ensure display is correct
    // Hide both view containers when empty
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

// Helper to manage empty state visibility based on data length
const updateEmptyStateVisibility = (isEmpty) => {
  if (isEmpty) {
      showEmptyState();
  } else {
      hideEmptyState();
  }
};


const showError = (message = 'Terjadi kesalahan.') => {
    hideLoading();
    // Hide both view containers on error
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

// Debounce function to limit frequency of function calls (e.g., on search input)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ======================
// INITIALIZATION
// ======================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initCalendar(); // Initialize calendar structure
    fetchData(); // Fetch data after DOM is loaded

    // Static event listeners
    elements.themeToggleBtn.addEventListener('click', toggleTheme);
    // elements.searchToggleBtn.addEventListener('click', toggleSearchInput); // Removed listener
    
    // Add menu toggle functionality
    if (elements.menuToggle && elements.floatingMenu) { 
        // Start Welcome Animation
        elements.floatingMenu.classList.add('welcome-animation');

        // After 3 seconds, end animation and set final position/enable drag
        setTimeout(() => {
            elements.floatingMenu.classList.remove('welcome-animation');
            
            // Set initial position after animation (e.g., top-right)
            // Ensure offsetWidth is calculated *after* animation class is removed
            const menuWidth = elements.floatingMenu.offsetWidth || 50; // Use default if offsetWidth is 0 initially
            elements.floatingMenu.style.top = '20px';
            elements.floatingMenu.style.left = `${window.innerWidth - menuWidth - 20}px`;
            setupDraggableMenu(); // Initialize dragging *after* positioning
        }, 3000); // 3000 milliseconds = 3 seconds
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (elements.floatingMenu.classList.contains('active') &&
            !elements.floatingMenu.contains(e.target) &&
            !elements.menuToggle.contains(e.target)) {
            elements.floatingMenu.classList.remove('active');
        }
    });
    // Modal closing listeners (already handled by delegation in attachDynamicListeners)
    // elements.closeModalBtn.addEventListener('click', hideModal);
    // elements.modalOverlay.addEventListener('click', hideModal); // Click outside modal content

    // Close modal with Escape key
     window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.modal.style.display === 'block') {
            hideModal();
        }
    });

    // View Switcher Listeners
    elements.gridViewBtn.addEventListener('click', () => switchView('grid'));
    elements.calendarViewBtn.addEventListener('click', () => switchView('calendar'));
});

// ======================
// DRAGGABLE MENU LOGIC
// ======================
const setupDraggableMenu = () => {
    const menuToggle = elements.menuToggle;
    const floatingMenu = elements.floatingMenu;

    const dragStart = (e) => {
        isDragging = true;
        hasDragged = false; // Reset drag flag
        menuToggle.style.cursor = 'grabbing'; // Change cursor
        
        // Get initial positions
        const event = e.type === 'touchstart' ? e.touches[0] : e;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        initialMenuX = floatingMenu.offsetLeft;
        initialMenuY = floatingMenu.offsetTop;

        // Add move and end listeners to the document/window
        document.addEventListener('mousemove', dragging);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchmove', dragging, { passive: false }); // passive: false to prevent scrolling on touch devices
        document.addEventListener('touchend', dragEnd);
        
        e.preventDefault(); // Prevent text selection during drag
    };

    const dragging = (e) => {
        if (!isDragging) return;
        hasDragged = true; // Mark as dragged

        const event = e.type === 'touchmove' ? e.touches[0] : e;
        const currentX = event.clientX;
        const currentY = event.clientY;

        const dx = currentX - dragStartX;
        const dy = currentY - dragStartY;

        let newX = initialMenuX + dx;
        let newY = initialMenuY + dy;

        // Boundary checks (keep within viewport)
        const menuWidth = floatingMenu.offsetWidth;
        const menuHeight = floatingMenu.offsetHeight;
        newX = Math.max(0, Math.min(newX, window.innerWidth - menuWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - menuHeight));

        floatingMenu.style.left = `${newX}px`;
        floatingMenu.style.top = `${newY}px`;
        
        e.preventDefault(); // Prevent scrolling while dragging on touch
    };

    const dragEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        menuToggle.style.cursor = 'pointer'; // Restore cursor

        // Remove listeners
        document.removeEventListener('mousemove', dragging);
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchmove', dragging);
        document.removeEventListener('touchend', dragEnd);

        // If it wasn't dragged significantly, treat as a click
        if (!hasDragged) {
            floatingMenu.classList.toggle('active');
        }
    };

    // Attach start listeners
    menuToggle.addEventListener('mousedown', dragStart);
    menuToggle.addEventListener('touchstart', dragStart);

    // Prevent the default click listener from firing if it was a drag
    menuToggle.addEventListener('click', (e) => {
        if (hasDragged) {
            e.preventDefault(); // Stop the click event if dragging occurred
            e.stopPropagation(); // Stop it from propagating further
        }
        // The actual toggle logic is now handled in dragEnd if !hasDragged
    }, true); // Use capture phase to potentially stop it earlier
};

// ======================
// CALENDAR FUNCTIONS
// ======================
const initCalendar = () => {
   if (calendarInstance) return; // Already initialized

   calendarInstance = new FullCalendar.Calendar(elements.calendarView, {
       initialView: 'dayGridMonth', // Or 'timeGridWeek', 'listWeek', etc.
       locale: 'id', // Set locale to Indonesian
       headerToolbar: {
           left: 'prev,next today',
           center: 'title',
           right: 'dayGridMonth,timeGridWeek,listWeek' // Example view options
       },
       events: [], // Start with empty events, will be populated by renderCalendar
       height: 'auto', // Adjust height automatically
       eventTimeFormat: { // Indonesian time format
           hour: '2-digit',
           minute: '2-digit',
           hour12: false // Use 24-hour format
       },
       // Optional: Handle event clicks
       eventClick: function(info) {
           // console.log('Event clicked:', info.event.extendedProps.itemData);
           // Example: Show modal with details of the clicked event
           const item = info.event.extendedProps.itemData;
           showGenericModal(`Detail: ${item.Mata_Pelajaran}`, [item]); // Show modal with single item data
           // Prevent browser navigation
           info.jsEvent.preventDefault();
       }
       // Add other FullCalendar options as needed
   });

   calendarInstance.render(); // Initial render of the calendar structure
};

const switchView = (view) => {
   if (view === currentView) return; // No change needed

   currentView = view;

   // Update button active states
   elements.gridViewBtn.classList.toggle('active', view === 'grid');
   elements.calendarViewBtn.classList.toggle('active', view === 'calendar');

   // Update container visibility
   elements.scheduleGrid.classList.toggle('active', view === 'grid');
   elements.calendarView.classList.toggle('active', view === 'calendar');

   // Ensure correct display property is set when activating
   elements.scheduleGrid.style.display = view === 'grid' ? 'grid' : 'none';
   elements.calendarView.style.display = view === 'calendar' ? 'block' : 'none';


   // Re-render content for the new view if data is already loaded
   if (allSchedules.length > 0) {
       filterSchedules(); // This will now render the correct view
   }
};
