/**
 * SmartQueue - Intelligent Queue Management & Emergency Triage System
 * Multi-Page Router + Authentication Engine + Real-Time Admin Dashboard
 */

// ============================================================================
// State Management
// ============================================================================
const state = {
  userToken: 'A-24',
  userName: 'Sarah Jenkins',
  userService: 'General Consultation',
  userPhone: '+1 (555) 234-8901',
  nowServingNum: 18,
  userTokenNum: 24,
  peopleAhead: 0,
  estimatedWaitMinutes: 5,
  isPriority: false,
  status: 'Confirmed',
  isAutoPlaying: false,
  autoPlayTimer: null,
  isBackendConnected: false,
  isLoggedIn: false,
  currentUser: { id: null, name: '', email: '', role: 'user', avatar: '' },
  
  // Peak Hours Data
  peakHours: '11:00 AM – 1:00 PM',
  peakAdvisory: 'Waiting times may be longer during peak hours.',

  // Admin Dashboard State
  adminStats: {
    totalPatients: 0,
    avgWaitTime: '0 mins',
    emergencyCases: 0,
    noShows: 0,
    peakTime: '11 AM – 1 PM'
  },
  adminRequests: [],
  adminFilter: 'all',
  adminPollTimer: null,

  queueList: [
    { token: 'A-18', name: 'James Wilson', service: 'General Medicine', status: 'In Consultation', wait: 0 },
    { token: 'A-19', name: 'Elena Rostova', service: 'General Medicine', status: 'Next Calling', wait: 1 },
    { token: 'A-20', name: 'Marcus Chen', service: 'Dental Clinic', status: 'Waiting', wait: 2 },
    { token: 'A-21', name: 'Aaliyah Patel', service: 'Radiology & Imaging', status: 'Waiting', wait: 3 },
    { token: 'A-22', name: 'David Kim', service: 'Pediatrics Care', status: 'Waiting', wait: 4 },
    { token: 'A-23', name: 'Lucia Morales', service: 'General Consultation', status: 'Waiting', wait: 4 },
    { token: 'A-24', name: 'Sarah Jenkins', service: 'General Consultation', status: 'Confirmed', wait: 5, isUser: true },
    { token: 'A-25', name: 'Oliver Brown', service: 'General Consultation', status: 'Waiting', wait: 8 },
    { token: 'A-26', name: 'Amira Hassan', service: 'Laboratory Tests', status: 'Waiting', wait: 11 },
  ]
};

// ============================================================================
// Audio Synthesizer
// ============================================================================
class SoundEffects {
  constructor() { this.ctx = null; }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playChime(type = 'turn') {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (type === 'urgent') {
        osc1.frequency.setValueAtTime(587.33, now);
        osc2.frequency.setValueAtTime(880.00, now + 0.1);
      } else if (type === 'reschedule') {
        osc1.frequency.setValueAtTime(440.00, now);
        osc2.frequency.setValueAtTime(554.37, now + 0.12);
      } else {
        osc1.frequency.setValueAtTime(523.25, now);
        osc2.frequency.setValueAtTime(659.25, now + 0.12);
      }

      osc1.type = 'sine';
      osc2.type = 'triangle';
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc1.connect(gain); osc2.connect(gain);
      gain.connect(this.ctx.destination);
      osc1.start(now); osc2.start(now);
      osc1.stop(now + 0.9); osc2.stop(now + 0.9);
    } catch (e) { }
  }
}

const sounds = new SoundEffects();

// ============================================================================
// Page Router
// ============================================================================
const pages = {
  login: document.getElementById('page-login'),
  getaccess: document.getElementById('page-getaccess'),
  dashboard: document.getElementById('page-dashboard'),
  admindashboard: document.getElementById('page-admin-dashboard'),
  doctordashboard: document.getElementById('page-doctor-dashboard'),
  book: document.getElementById('page-book'),
  priority: document.getElementById('page-priority'),
};

function navigateTo(pageId) {
  // Security Guard: Prevent regular users from opening admin dashboard
  if (pageId === 'admindashboard' && state.currentUser.role !== 'admin') {
    showToast('Access Denied', 'Admin privileges are required to view the Admin Dashboard.', 'urgent');
    pageId = 'dashboard';
  }
  
  if (pageId === 'doctordashboard' && state.currentUser.role !== 'doctor') {
    showToast('Access Denied', 'Doctor privileges are required to view the Doctor Dashboard.', 'urgent');
    pageId = 'dashboard';
  }

  // Hide all pages
  Object.values(pages).forEach(p => {
    if (p) p.classList.remove('active');
  });

  // Stop admin polling if navigating away from admin dashboard
  if (pageId !== 'admindashboard' && state.adminPollTimer) {
    clearInterval(state.adminPollTimer);
    state.adminPollTimer = null;
  }

  // Show target page
  const target = pages[pageId];
  if (target) {
    requestAnimationFrame(() => {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Page-specific setup
  if (pageId === 'priority') {
    const el = document.getElementById('priorityTokenDisplay');
    if (el) el.value = state.userToken;
  }
  if (pageId === 'book') {
    const dateInput = document.getElementById('preferredDate');
    if (dateInput) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.min = today;
      dateInput.value = today;
    }
  }
  if (pageId === 'admindashboard') {
    fetchAdminData();
    // Start real-time admin polling every 4s
    if (!state.adminPollTimer) {
      state.adminPollTimer = setInterval(fetchAdminData, 4000);
    }
  }

  if (pageId === 'doctordashboard') {
    fetchDoctorData();
    if (!state.adminPollTimer) {
      state.adminPollTimer = setInterval(fetchDoctorData, 4000);
    }
  }
}

// ============================================================================
// Backend API Integration
// ============================================================================
const API_BASE = window.location.origin.startsWith('http')
  ? window.location.origin
  : 'http://127.0.0.1:5000';

async function fetchQueueStatusFromBackend() {
  try {
    const res = await fetch(`${API_BASE}/api/queue/status`, { method: 'GET' });
    if (!res.ok) throw new Error('Backend error');
    const data = await res.json();

    state.isBackendConnected = true;
    state.nowServingNum = data.now_serving_num;
    state.userToken = data.user_token;
    state.userName = data.user_name;
    state.userService = data.user_service;
    state.status = data.user_status;
    state.isPriority = data.is_priority;
    state.peopleAhead = data.people_ahead;
    state.estimatedWaitMinutes = data.estimated_wait_minutes;
    state.queueList = data.queue_list || state.queueList;
    if (data.peak_hours) state.peakHours = data.peak_hours;
    if (data.peak_advisory) state.peakAdvisory = data.peak_advisory;

    if (state.isLoggedIn) {
      try {
        const notifRes = await fetch(`${API_BASE}/api/notifications`);
        const notifData = await notifRes.json();
        state.notifications = notifData.notifications || [];
      } catch(e) {}
    }

    updateUI();
  } catch (err) {
    state.isBackendConnected = false;
    updateUI();
  }
}

async function checkSessionOnLoad() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { method: 'GET' });
    const data = await res.json();
    if (data.authenticated && data.user) {
      state.isLoggedIn = true;
      state.currentUser = data.user;
      state.userName = `${data.user.first_name} ${data.user.last_name}`.trim();
      updateNavUserPill();
      
      if (data.user.role === 'admin') {
        navigateTo('admindashboard');
      } else {
        navigateTo('dashboard');
        fetchQueueStatusFromBackend();
      }
    }
  } catch (e) { }
}

// ============================================================================
// UI Render & Component Sync
// ============================================================================
function updateUI() {
  const $ = id => document.getElementById(id);

  if ($('tokenNumberDisplay')) $('tokenNumberDisplay').textContent = state.userToken;
  if ($('tokenServiceTag')) $('tokenServiceTag').textContent = state.userService;
  if ($('userTokenLabel')) $('userTokenLabel').textContent = `${state.userToken} you`;
  if ($('nowServingLabel')) $('nowServingLabel').textContent = `A-${state.nowServingNum} now serving`;

  if (!state.isBackendConnected) {
    const diff = state.userTokenNum - state.nowServingNum;
    state.peopleAhead = Math.max(0, state.isPriority ? 1 : diff > 0 ? diff - 1 : 0);
  }

  if ($('peopleAheadCount')) $('peopleAheadCount').textContent = state.peopleAhead;

  if (!state.isBackendConnected) {
    if (state.status === 'Calling Now') state.estimatedWaitMinutes = 0;
    else if (state.isPriority) state.estimatedWaitMinutes = 2;
    else if (state.status === 'Rescheduled (30m)') state.estimatedWaitMinutes = 30;
    else if (state.status === 'Rescheduled (2h)') state.estimatedWaitMinutes = 120;
    else if (state.status === 'Rescheduled (Tomorrow)') state.estimatedWaitMinutes = 960;
    else state.estimatedWaitMinutes = Math.max(1, state.peopleAhead * 2 + 1);
  }

  if ($('estimatedWaitCount')) $('estimatedWaitCount').textContent = state.estimatedWaitMinutes;

  const badge = $('tokenStatusBadge');
  if (badge) {
    badge.textContent = state.status;
    badge.className = 'status-badge';
    badge.classList.add(
      (state.status === 'Priority Expedited' || state.isPriority || state.status === 'Calling Now')
        ? 'status-priority' 
        : state.status === 'Skipped' 
          ? 'status-urgent' 
          : 'status-confirmed'
    );
  }

  const missedCard = $('missedSlotsCard');
  if (missedCard) {
    if (state.status === 'Skipped') {
      missedCard.style.border = '2px solid var(--color-urgent-red)';
      missedCard.style.boxShadow = '0 8px 20px rgba(239, 68, 68, 0.3)';
      missedCard.querySelector('.missed-title').innerHTML = '⚠️ Doctor Skipped You. <br> Pick a new slot to rejoin the queue.';
    } else {
      missedCard.style.border = '';
      missedCard.style.boxShadow = '';
      missedCard.querySelector('.missed-title').textContent = 'Missed your turn? Pick a new one in seconds.';
    }
  }

  const fill = $('queueProgressFill');
  if (fill) {
    let pct = state.isPriority ? 94 : state.peopleAhead === 0 ? 98 : Math.min(95, Math.max(20, 100 - state.peopleAhead * 14));
    fill.style.width = `${pct}%`;
  }

  const alertText = $('urgentAlertText');
  const notifList = $('notificationList');
  if (notifList && state.notifications && state.notifications.length > 0) {
    alertText.textContent = 'Recent Notifications:';
    notifList.innerHTML = state.notifications.map(n => `<div style="margin-bottom:0.5rem"><strong>${n.title}</strong><br/>${n.message} <br><small style="color:var(--color-text-light)">${n.created_at}</small></div>`).join('<hr style="margin:0.5rem 0; border:none; border-top:1px solid rgba(255,255,255,0.1);">');
  } else if (alertText) {
    if (notifList) notifList.innerHTML = '';
    if (state.isPriority) {
      alertText.textContent = `Priority active — ${state.userToken} moved to position 2 (Calling Next)`;
    } else if (state.status && state.status.startsWith('Rescheduled')) {
      alertText.textContent = `Appointment rescheduled to new slot (${state.userToken})`;
    } else {
      alertText.textContent = 'No recent notifications';
    }
  }

  if ($('c1Token')) $('c1Token').textContent = `A-${state.nowServingNum}`;
  if ($('c2Token')) $('c2Token').textContent = `B-0${(state.nowServingNum % 8) + 1}`;
  if ($('c3Token')) $('c3Token').textContent = state.isPriority ? state.userToken : 'P-03';

  // Peak Hours Sync
  if ($('userPeakTimeDisplay')) $('userPeakTimeDisplay').textContent = `Peak Hours: ${state.peakHours}`;
  if ($('userPeakAdvisory')) $('userPeakAdvisory').textContent = state.peakAdvisory || 'Waiting times may be longer during peak hours.';

  renderQueueTable();
  updateQueueAnimation();
}

function updateNavUserPill() {
  const name = state.currentUser.name || state.userName || 'User';
  const firstLetter = name.charAt(0).toUpperCase();

  const userNavName = document.getElementById('navUserName');
  const userNavAvatar = document.getElementById('navUserAvatar');
  if (userNavName) userNavName.textContent = name.split(' ')[0];
  if (userNavAvatar) userNavAvatar.textContent = firstLetter;

  const adminNavName = document.getElementById('adminUserName');
  const adminNavAvatar = document.getElementById('adminUserAvatar');
  if (adminNavName) adminNavName.textContent = name;
  if (adminNavAvatar) adminNavAvatar.textContent = firstLetter;
}

function renderQueueTable() {
  const tbody = document.getElementById('queueTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.queueList.forEach(item => {
    const tr = document.createElement('tr');
    if (item.token === state.userToken || item.isUser) tr.classList.add('highlight-user');
    tr.innerHTML = `
      <td><strong>${item.token}</strong>${item.token === state.userToken ? ' <em>(You)</em>' : ''}</td>
      <td>${item.name}</td>
      <td>${item.service}</td>
      <td><span class="status-badge ${item.status === 'Next Calling' || item.status === 'In Consultation' ? 'status-confirmed' : ''}">${item.status}</span></td>
      <td>${item.wait} min</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================================
// Animated Queue Scene
// ============================================================================
const personColors = ['green', 'blue', 'purple', 'orange', 'red'];

function buildPersonFigure(token, name, colorClass, isYou, animationDelay) {
  const wrapper = document.createElement('div');
  wrapper.className = `queue-person ${isYou ? 'person-you' : 'person-' + colorClass}`;
  wrapper.style.animationDelay = animationDelay + 'ms';
  wrapper.title = isYou ? 'You — ' + token : name + ' — ' + token;

  wrapper.innerHTML = `
    <div class="person-tooltip">${isYou ? 'YOU' : token}</div>
    <div class="person-body">
      <div class="person-head"></div>
      <div class="person-torso"></div>
      <div class="person-legs">
        <div class="person-leg"></div>
        <div class="person-leg"></div>
      </div>
    </div>
    <div class="person-token-badge">${token}</div>
  `;

  return wrapper;
}

function updateQueueAnimation() {
  const line = document.getElementById('queuePeopleLine');
  const countEl = document.getElementById('queueSceneCount');
  if (!line) return;

  line.innerHTML = '';
  const waitingPeople = state.queueList.filter(p => p.status !== 'Cancelled' && p.status !== 'In Consultation');
  const displayPeople = waitingPeople.slice(0, 10);

  if (countEl) countEl.textContent = waitingPeople.length;

  displayPeople.forEach((person, idx) => {
    const isYou = person.token === state.userToken || person.isUser;
    const colorClass = personColors[idx % personColors.length];
    const delay = idx * 80;
    const figure = buildPersonFigure(person.token, person.name, colorClass, isYou, delay);
    line.appendChild(figure);
  });
}

// ============================================================================
// Toast Notifications
// ============================================================================
function showToast(title, message, type = 'normal') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'urgent' ? 'toast-urgent' : type === 'reschedule' ? 'toast-reschedule' : ''}`;

  const icons = { urgent: '🚨', reschedule: '🗓️', success: '✓', normal: '🔔' };
  const icon = icons[type] || '🔔';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-text">
      <strong>${title}</strong><br>
      <small>${message}</small>
    </div>
  `;

  container.appendChild(toast);
  sounds.playChime(type === 'urgent' ? 'urgent' : type === 'reschedule' ? 'reschedule' : 'turn');

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-15px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ============================================================================
// Auth & Role Handlers (Requirement 1 & Requirement 2)
// ============================================================================
async function handleLogin(e) {
  e.preventDefault();

  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const submitBtn = document.getElementById('loginSubmitBtn');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  const loader = document.getElementById('loginLoader');
  const errorBanner = document.getElementById('loginErrorMsg');

  if (errorBanner) errorBanner.classList.add('hidden');
  if (btnText) btnText.classList.add('hidden');
  if (loader) loader.classList.remove('hidden');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      if (errorBanner) {
        errorBanner.textContent = data.error || 'Invalid credentials. Please check your email and password.';
        errorBanner.classList.remove('hidden');
      }
      showToast('Login Failed', data.error || 'Invalid credentials', 'urgent');
      return;
    }

    // Auth Successful
    const user = data.user;
    state.isLoggedIn = true;
    state.currentUser = user;
    state.userName = `${user.first_name} ${user.last_name}`.trim();

    updateNavUserPill();
    showToast('Welcome back!', `Signed in as ${user.first_name} (${user.role.toUpperCase()}).`, 'success');

    // Role-based redirection (Requirement 2)
    if (user.role === 'admin') {
      navigateTo('admindashboard');
    } else if (user.role === 'doctor') {
      navigateTo('doctordashboard');
    } else {
      navigateTo('dashboard');
      fetchQueueStatusFromBackend();
    }
  } catch (err) {
    if (errorBanner) {
      errorBanner.textContent = 'Unable to connect to server. Please ensure the backend is running.';
      errorBanner.classList.remove('hidden');
    }
  } finally {
    if (btnText) btnText.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');
  }
}

async function handleRegister(e) {
  e.preventDefault();

  const firstName = document.getElementById('regFirstName');
  const lastName = document.getElementById('regLastName');
  const email = document.getElementById('regEmail');
  const phone = document.getElementById('regPhone');
  const password = document.getElementById('regPassword');
  const adminKey = document.getElementById('adminKey');
  const submitBtn = document.getElementById('registerSubmitBtn');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  const loader = document.getElementById('registerLoader');
  const errorBanner = document.getElementById('registerErrorMsg');

  // Selected account role
  const selectedRoleInput = document.querySelector('input[name="accountRole"]:checked');
  const role = selectedRoleInput ? selectedRoleInput.value : 'user';

  if (errorBanner) errorBanner.classList.add('hidden');
  if (btnText) btnText.classList.add('hidden');
  if (loader) loader.classList.remove('hidden');

  try {
    const payload = {
      first_name: firstName ? firstName.value.trim() : '',
      last_name: lastName ? lastName.value.trim() : '',
      email: email ? email.value.trim() : '',
      phone: phone ? phone.value.trim() : '',
      password: password ? password.value.trim() : ''
    };

    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      if (errorBanner) {
        errorBanner.textContent = data.error || 'Registration failed. Please check your inputs.';
        errorBanner.classList.remove('hidden');
      }
      showToast('Registration Error', data.error || 'Could not create account', 'urgent');
      return;
    }

    // Account created
    showToast('Account Created!', 'Registration successful. Please sign in with your credentials.', 'success');
    navigateTo('login');
  } catch (err) {
    if (errorBanner) {
      errorBanner.textContent = 'Server connection error. Please try again.';
      errorBanner.classList.remove('hidden');
    }
  } finally {
    if (btnText) btnText.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');
  }
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
  } catch (e) { }

  state.isLoggedIn = false;
  state.currentUser = { id: null, name: '', email: '', role: 'user' };
  navigateTo('login');
  showToast('Signed Out', 'You have been logged out successfully.', 'normal');
}

// Setup Role Cards (Sign Up)
function setupRoleSelection() {
  const cardUser = document.getElementById('roleCardUser');
  const cardAdmin = document.getElementById('roleCardAdmin');
  const adminKeyGroup = document.getElementById('adminKeyGroup');

  if (!cardUser || !cardAdmin) return;

  cardUser.addEventListener('click', () => {
    cardUser.classList.add('active');
    cardAdmin.classList.remove('active');
    const radio = cardUser.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
    if (adminKeyGroup) adminKeyGroup.classList.add('hidden');
  });

  cardAdmin.addEventListener('click', () => {
    cardAdmin.classList.add('active');
    cardUser.classList.remove('active');
    const radio = cardAdmin.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
    if (adminKeyGroup) adminKeyGroup.classList.remove('hidden');
  });
}

// ============================================================================
// File Upload Dropzones (Requirement 5)
// ============================================================================
function setupFileUpload(dropzoneId, inputId, previewId, imgId, nameId, removeBtnId) {
  const dropzone = document.getElementById(dropzoneId);
  const input = document.getElementById(inputId);
  const previewContainer = document.getElementById(previewId);
  const previewImg = document.getElementById(imgId);
  const fileNameDisplay = document.getElementById(nameId);
  const removeBtn = document.getElementById(removeBtnId);

  if (!input) return;

  function handleFileSelect(file) {
    if (!file) return;

    // Client-side format & size validation
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Invalid File Format', 'Please upload a JPG, PNG, or WEBP image file.', 'urgent');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      showToast('File Too Large', 'Maximum image upload size is 5MB.', 'urgent');
      input.value = '';
      return;
    }

    if (fileNameDisplay) fileNameDisplay.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg) previewImg.src = e.target.result;
      if (previewContainer) previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      if (previewContainer) previewContainer.classList.add('hidden');
      if (previewImg) previewImg.src = '';
      if (fileNameDisplay) fileNameDisplay.textContent = '';
    });
  }

  if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files[0]) {
        input.files = files;
        handleFileSelect(files[0]);
      }
    });
  }
}

// ============================================================================
// Priority Request & Booking Actions
// ============================================================================
async function handlePrioritySubmit(e) {
  e.preventDefault();

  const btn = document.getElementById('confirmPriorityBtn');
  const result = document.getElementById('priorityResult');
  const form = document.getElementById('priorityForm');
  const typeSelect = document.getElementById('emergencyType');
  const descText = document.getElementById('emergencyDesc');
  const photoInput = document.getElementById('priorityPhotoInput');

  if (btn) { btn.textContent = 'Submitting Triage...'; btn.disabled = true; }

  const formData = new FormData();
  formData.append('emergency_type', typeSelect ? typeSelect.value : 'Medical Emergency');
  formData.append('emergency_desc', descText ? descText.value.trim() : '');

  if (photoInput && photoInput.files && photoInput.files[0]) {
    formData.append('photo', photoInput.files[0]);
  }

  try {
    const res = await fetch(`${API_BASE}/api/queue/priority`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      state.isPriority = true;
      state.userToken = data.token;
      state.status = data.status;
      state.estimatedWaitMinutes = data.estimated_wait_minutes;
      state.peopleAhead = 1;

      fetchQueueStatusFromBackend();

      if (form) form.style.display = 'none';
      if (result) result.classList.remove('hidden');

      const msgEl = document.getElementById('priorityResultMsg');
      const tokenEl = document.getElementById('priorityNewToken');
      if (msgEl) msgEl.textContent = `You've been moved to position 2. Estimated wait: 2 minutes.`;
      if (tokenEl) tokenEl.textContent = data.token;

      showToast('Priority Triage Activated', `Token ${data.token} moved to Position 2.`, 'urgent');
    }
  } catch (err) {
    showToast('Triage Failed', 'Could not activate priority triage. Please try again.', 'urgent');
  } finally {
    if (btn) { btn.textContent = '🚨 Activate Emergency Priority Access'; btn.disabled = false; }
  }
}

async function handleBookingSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('patientName');
  const phone = document.getElementById('patientPhone');
  const service = document.getElementById('serviceDepartment');
  const isUrgent = document.getElementById('bookWithPriority');
  const photoInput = document.getElementById('bookingPhotoInput');
  const btn = document.getElementById('confirmBookingBtn');

  if (btn) { btn.textContent = 'Generating token...'; btn.disabled = true; }

  const formData = new FormData();
  formData.append('patient_name', name ? name.value.trim() : 'Patient');
  formData.append('phone', phone ? phone.value.trim() : '');
  formData.append('department', service ? service.value : 'General Consultation');
  formData.append('is_priority', isUrgent && isUrgent.checked ? 'true' : 'false');

  if (photoInput && photoInput.files && photoInput.files[0]) {
    formData.append('photo', photoInput.files[0]);
  }

  try {
    const res = await fetch(`${API_BASE}/api/appointments/book`, {
      method: 'POST',
      body: formData
    });
    const tokenData = await res.json();
    await fetchQueueStatusFromBackend();

    if (btn) { btn.textContent = 'Generate Token and Join Queue'; btn.disabled = false; }

    const tokenEl = document.getElementById('successTokenDisplay');
    const msgEl = document.getElementById('successMessage');
    const detailsEl = document.getElementById('successDetails');

    if (tokenEl) tokenEl.textContent = `Your Token: ${tokenData.token}`;
    if (msgEl) msgEl.textContent = tokenData.is_priority
      ? 'Priority access granted! You are near the front of the queue.'
      : 'Successfully joined the queue. You will receive an SMS alert when it is almost your turn.';
    if (detailsEl) detailsEl.innerHTML = `
      <div>Department: <strong>${tokenData.department}</strong></div>
      <div>Status: <strong>${tokenData.status}</strong></div>
      <div>Estimated wait: <strong>${tokenData.estimated_wait} min</strong></div>
      ${tokenData.photo_path ? '<div>Attachment: <strong>Photo uploaded</strong></div>' : ''}
    `;

    openModal('bookingSuccessModal');
  } catch (err) {
    if (btn) { btn.textContent = 'Generate Token and Join Queue'; btn.disabled = false; }
    showToast('Booking Failed', 'Could not complete appointment booking.', 'urgent');
  }
}

async function handleReschedule() {
  state.isPriority = false;
  
  const input = document.getElementById('rescheduleDurationInput');
  
  if (!input || !input.value) {
    showToast('Validation Error', 'Please select a valid duration.', 'urgent');
    return;
  }
  
  const payload = { duration: input.value };
  
  try {
    const res = await fetch(`${API_BASE}/api/queue/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) {
      showToast('Reschedule Error', data.error || 'Could not reschedule slot.', 'urgent');
      return;
    }
    await fetchQueueStatusFromBackend();
    showToast('Slot Rescheduled', data.message, 'reschedule');
  } catch (e) {
    showToast('Reschedule Error', 'Could not reschedule slot.', 'urgent');
  }
}

function setupRescheduleWheel() {
  const container = document.getElementById('rescheduleWheelContainer');
  const list = document.getElementById('rescheduleWheelList');
  const input = document.getElementById('rescheduleDurationInput');
  
  if (!list || !input || !container) return;

  const options = [];
  for (let i = 1; i <= 48; i++) {
    const totalMinutes = i * 15;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    
    let text = '';
    if (hours > 0) text += `${hours} hour${hours > 1 ? 's' : ''}`;
    if (hours > 0 && mins > 0) text += ' ';
    if (mins > 0) text += `${mins} minutes`;
    
    options.push({ text });
  }

  list.innerHTML = options.map(opt => `<li class="wheel-item" data-val="${opt.text}">${opt.text}</li>`).join('');

  const items = list.querySelectorAll('.wheel-item');

  function updateSelection() {
    const containerCenter = container.getBoundingClientRect().top + container.offsetHeight / 2;
    let closestItem = null;
    let minDistance = Infinity;

    items.forEach(item => {
      const rect = item.getBoundingClientRect();
      const itemCenter = rect.top + rect.height / 2;
      const distance = Math.abs(itemCenter - containerCenter);
      
      item.classList.remove('selected');
      if (distance < minDistance) {
        minDistance = distance;
        closestItem = item;
      }
    });

    if (closestItem) {
      closestItem.classList.add('selected');
      input.value = closestItem.getAttribute('data-val');
    }
  }

  list.addEventListener('scroll', () => {
    updateSelection();
  });

  input.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.toggle('hidden');
    if (!container.classList.contains('hidden')) {
      setTimeout(updateSelection, 50);
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target) && e.target !== input) {
      container.classList.add('hidden');
    }
  });

  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      list.scrollTo({
        top: item.offsetTop - list.offsetTop - (container.offsetHeight / 2) + (item.offsetHeight / 2),
        behavior: 'smooth'
      });
      setTimeout(() => container.classList.add('hidden'), 300);
    });
  });
}

async function advanceQueue() {
  try {
    const res = await fetch(`${API_BASE}/api/queue/next`, { method: 'POST' });
    const data = await res.json();
    await fetchQueueStatusFromBackend();
    if (data.is_user_turn) {
      showToast("It's Your Turn!", `Token ${state.userToken} called to Counter 1.`, 'success');
    } else {
      showToast('Queue Advanced', `Now serving: ${data.now_serving_token}.`, 'normal');
    }
  } catch (e) { }
}

async function resetQueue() {
  if (state.autoPlayTimer) {
    clearInterval(state.autoPlayTimer);
    state.isAutoPlaying = false;
    const btn = document.getElementById('simAutoPlayBtn');
    if (btn) btn.textContent = '▶ Auto-Play';
  }

  try {
    await fetch(`${API_BASE}/api/queue/reset`, { method: 'POST' });
    await fetchQueueStatusFromBackend();
    showToast('Queue Reset', 'Simulator restored to initial state.', 'normal');
  } catch (e) { }
}

function toggleAutoPlay() {
  const btn = document.getElementById('simAutoPlayBtn');
  if (state.isAutoPlaying) {
    clearInterval(state.autoPlayTimer);
    state.isAutoPlaying = false;
    if (btn) btn.textContent = '▶ Auto-Play';
    showToast('Simulation Paused', 'Manual advancement mode.', 'normal');
  } else {
    state.isAutoPlaying = true;
    if (btn) btn.textContent = '⏸ Pause';
    showToast('Simulation Running', 'Queue advances every 5 seconds.', 'normal');
    state.autoPlayTimer = setInterval(advanceQueue, 5000);
  }
}

// ============================================================================
// Dedicated Admin Dashboard Engine (Requirement 3)
// ============================================================================
async function fetchAdminData() {
  try {
    // 1. Fetch Performance Stats
    const statsRes = await fetch(`${API_BASE}/api/admin/stats`, {
      headers: { 'X-User-Role': state.currentUser.role }
    });
    if (statsRes.ok) {
      const stats = await statsRes.json();
      state.adminStats = stats;
      renderAdminStats();
    }

    // 2. Fetch Requests
    const reqRes = await fetch(`${API_BASE}/api/admin/requests`, {
      headers: { 'X-User-Role': state.currentUser.role }
    });
    if (reqRes.ok) {
      const data = await reqRes.json();
      state.adminRequests = data.requests || [];
      renderAdminPendingRequests();
      renderAdminActiveQueue();
      renderAdminHistoryQueue();
    }
  } catch (err) {
    console.error('Error loading admin data:', err);
  }
}

function renderAdminStats() {
  const s = state.adminStats;
  const $ = id => document.getElementById(id);

  if ($('adminStatPatients')) $('adminStatPatients').textContent = s.total_patients || '0';
  if ($('adminStatAvgWait')) $('adminStatAvgWait').textContent = s.avg_wait_time || '0 mins';
  if ($('adminStatEmergencies')) $('adminStatEmergencies').textContent = s.emergency_cases || '0';
  if ($('adminStatNoShows')) $('adminStatNoShows').textContent = s.no_shows || '0';
  if ($('adminStatPeakTime')) $('adminStatPeakTime').textContent = s.peak_time || '11 AM – 1 PM';
}

function renderAdminPendingRequests() {
  const container = document.getElementById('adminPendingRequestsContainer');
  const countBadge = document.getElementById('pendingRequestsCount');
  const emptyState = document.getElementById('pendingEmptyState');
  if (!container) return;

  container.innerHTML = '';
  const pendingRequests = state.adminRequests.filter(r => r.status === 'Pending Approval');

  if (countBadge) countBadge.textContent = `${pendingRequests.length} Pending Review`;

  if (pendingRequests.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  } else {
    if (emptyState) emptyState.classList.add('hidden');
  }

  pendingRequests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'pending-request-card';

    const photoBtnHtml = req.photo_path
      ? `<button class="photo-thumb-btn" style="margin-top:0.5rem;" onclick="openPhotoModal('/uploads/${req.photo_path}', '${req.patient_name}')">📷 View Uploaded Photo</button>`
      : '<div style="font-size:0.78rem; color:var(--color-text-light); margin-top:0.25rem;">No photo attached</div>';

    card.innerHTML = `
      <div>
        <div class="pending-card-top">
          <span class="pending-patient-token">${req.token}</span>
          <span class="priority-pill prio-pending">⏳ Pending Approval</span>
        </div>
        <div class="pending-card-body">
          <div><strong>Patient:</strong> ${req.patient_name} (${req.phone || 'No phone'})</div>
          <div><strong>Department:</strong> ${req.department}</div>
          ${req.emergency_type ? `<div class="pending-reason-tag">🚨 ${req.emergency_type}</div>` : ''}
          ${req.emergency_desc ? `<div class="pending-desc-quote">"${req.emergency_desc}"</div>` : ''}
          ${photoBtnHtml}
          <div style="font-size:0.78rem; color:var(--color-text-light); margin-top:0.5rem;">Submitted: ${req.created_at || 'Just now'}</div>
        </div>
      </div>
      <div class="pending-actions-row">
        <button class="btn-approve" onclick="approvePriorityRequest(${req.id})">✓ Approve Priority</button>
        <button class="btn-reject" onclick="rejectPriorityRequest(${req.id})">✕ Reject</button>
      </div>
    `;

    container.appendChild(card);
  });
}

function renderAdminActiveQueue() {
  const tbody = document.getElementById('adminActiveTableBody');
  const emptyState = document.getElementById('adminActiveEmptyState');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('adminActiveSearch')?.value || '').toLowerCase();
  
  // Filter for ACTIVE only
  let filtered = state.adminRequests.filter(r => !['Completed', 'Resolved', 'Cancelled'].includes(r.status));
  
  if (state.adminFilter === 'emergency') {
    filtered = filtered.filter(r => r.is_priority || r.priority_level === 'Critical' || r.emergency_type || r.status === 'Pending Approval');
  }

  if (searchVal) {
    filtered = filtered.filter(r => 
      (r.patient_name || '').toLowerCase().includes(searchVal) ||
      (r.token || '').toLowerCase().includes(searchVal) ||
      (r.department || '').toLowerCase().includes(searchVal)
    );
  }

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  } else {
    if (emptyState) emptyState.classList.add('hidden');
  }

  filtered.forEach(req => {
    const tr = document.createElement('tr');
    if (req.is_priority || req.priority_level === 'Critical') tr.classList.add('highlight-emergency');

    const prioClass = req.status === 'Pending Approval' ? 'prio-pending' : req.status === 'Priority Rejected' ? 'prio-rejected' : req.priority_level === 'Critical' ? 'prio-critical' : req.priority_level === 'High' ? 'prio-high' : 'prio-normal';
    const prioLabel = req.status === 'Pending Approval' ? 'Pending Approval' : req.status === 'Priority Rejected' ? 'Rejected' : (req.priority_level || (req.is_priority ? 'Critical' : 'Normal'));

    const photoCellHtml = req.photo_path
      ? `<button class="photo-thumb-btn" onclick="openPhotoModal('/uploads/${req.photo_path}', '${req.patient_name}')">📷 View Photo</button>`
      : '<span class="text-muted" style="font-size:0.8rem; color:#888;">None</span>';

    tr.innerHTML = `
      <td>
        <strong>${req.token}</strong><br>
        <small style="color:var(--color-text-light);">ID #${req.id}</small>
      </td>
      <td>
        <strong>${req.patient_name}</strong><br>
        <small style="color:var(--color-text-muted);">${req.phone || 'No phone'}</small>
      </td>
      <td>
        <strong>${req.department}</strong>
        ${req.emergency_type ? `<div style="font-size:0.8rem; color:var(--color-urgent-red); margin-top:2px;">🚨 ${req.emergency_type}</div>` : ''}
        ${req.emergency_desc ? `<div style="font-size:0.75rem; color:var(--color-text-muted); font-style:italic;">"${req.emergency_desc}"</div>` : ''}
      </td>
      <td><span class="priority-pill ${prioClass}">${prioLabel}</span></td>
      <td>${photoCellHtml}</td>
      <td><strong>Pos #${req.position}</strong> (${req.estimated_wait}m)</td>
      <td>
        <select class="admin-action-select" onchange="updateRequestStatus(${req.id}, this.value)">
          <option value="Waiting" ${req.status === 'Waiting' ? 'selected' : ''}>Waiting</option>
          <option value="Confirmed" ${req.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="Pending Approval" ${req.status === 'Pending Approval' ? 'selected' : ''}>Pending Approval</option>
          <option value="Calling Now" ${req.status === 'Calling Now' ? 'selected' : ''}>Calling Now</option>
          <option value="In Consultation" ${req.status === 'In Consultation' ? 'selected' : ''}>In Consultation</option>
          <option value="Cancelled" ${req.status === 'Cancelled' ? 'selected' : ''}>Cancel Request</option>
        </select>
      </td>
      <td>
        ${req.status === 'Pending Approval' ? `
          <div style="display:flex; gap:0.35rem;">
            <button class="bump-btn" style="background:var(--color-sage);" onclick="approvePriorityRequest(${req.id})">✓</button>
            <button class="bump-btn" style="background:var(--color-urgent-red);" onclick="rejectPriorityRequest(${req.id})">✕</button>
          </div>
        ` : req.position > 2 ? `<button class="bump-btn" onclick="bumpPriority(${req.id})">⚡ Bump</button>` : '<span style="font-size:0.75rem; color:green; font-weight:700;">Top Queue</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdminHistoryQueue() {
  const tbody = document.getElementById('adminHistoryTableBody');
  const emptyState = document.getElementById('adminHistoryEmptyState');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('adminHistorySearch')?.value || '').toLowerCase();
  
  let filtered = state.adminRequests.filter(r => ['Completed', 'Resolved', 'Cancelled', 'Skipped'].includes(r.status));

  if (searchVal) {
    filtered = filtered.filter(r => 
      (r.patient_name || '').toLowerCase().includes(searchVal) ||
      (r.token || '').toLowerCase().includes(searchVal) ||
      (r.department || '').toLowerCase().includes(searchVal)
    );
  }

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  } else {
    if (emptyState) emptyState.classList.add('hidden');
  }

  filtered.forEach(req => {
    const tr = document.createElement('tr');
    const createdStr = req.created_at ? new Date(req.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--';
    
    tr.innerHTML = `
      <td><strong>${req.token}</strong><br><small style="color:var(--color-text-light);">ID #${req.id}</small></td>
      <td><strong>${req.patient_name}</strong></td>
      <td>${req.department}</td>
      <td>${req.is_priority ? '<span style="color:red">Emergency</span>' : 'Standard'}</td>
      <td><strong>${req.status}</strong></td>
      <td>${createdStr}</td>
      <td>${req.skipped_at || 'Just now'}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function approvePriorityRequest(requestId) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/requests/${requestId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': state.currentUser.role
      }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Priority Approved', data.message || `Request #${requestId} approved!`, 'success');
      fetchAdminData();
    } else {
      showToast('Error', data.error || 'Failed to approve request.', 'urgent');
    }
  } catch (e) {
    showToast('Error', 'Failed to approve priority request.', 'urgent');
  }
}

async function rejectPriorityRequest(requestId) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/requests/${requestId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': state.currentUser.role
      }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Priority Rejected', data.message || `Request #${requestId} rejected.`, 'normal');
      fetchAdminData();
    } else {
      showToast('Error', data.error || 'Failed to reject request.', 'urgent');
    }
  } catch (e) {
    showToast('Error', 'Failed to reject priority request.', 'urgent');
  }
}

async function updateRequestStatus(requestId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/requests/${requestId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': state.currentUser.role
      },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Status Updated', `Request #${requestId} status set to '${newStatus}'.`, 'success');
      fetchAdminData();
    }
  } catch (e) {
    showToast('Error', 'Failed to update request status.', 'urgent');
  }
}

window.approvePriorityRequest = approvePriorityRequest;
window.rejectPriorityRequest = rejectPriorityRequest;

async function bumpPriority(requestId) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/requests/${requestId}/priority`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': state.currentUser.role
      },
      body: JSON.stringify({ priority_level: 'Critical' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Priority Bumped', `Request #${requestId} bumped to Critical priority.`, 'urgent');
      fetchAdminData();
    }
  } catch (e) {
    showToast('Error', 'Failed to update priority.', 'urgent');
  }
}

function openPhotoModal(imgSrc, patientName) {
  const modal = document.getElementById('photoViewModal');
  const img = document.getElementById('photoModalImg');
  const title = document.getElementById('photoModalTitle');
  const desc = document.getElementById('photoModalDesc');

  if (img) img.src = imgSrc;
  if (title) title.textContent = `Attachment: ${patientName}`;
  if (desc) desc.textContent = `Supporting photo uploaded by ${patientName} for clinical triage assessment.`;

  openModal('photoViewModal');
}

// Global functions for table inline onclick
window.updateRequestStatus = updateRequestStatus;
window.bumpPriority = bumpPriority;
window.openPhotoModal = openPhotoModal;

// ============================================================================
// Doctor Dashboard Engine (Requirement 4)
// ============================================================================
let currentDoctorPatientId = null;

async function fetchDoctorData() {
  try {
    const res = await fetch(`${API_BASE}/api/doctor/current`, {
      headers: { 'X-User-Role': state.currentUser.role }
    });
    if (res.ok) {
      const data = await res.json();
      renderDoctorPatient(data.patient);
    }
  } catch (err) {
    console.error('Error loading doctor data:', err);
  }
}

function renderDoctorPatient(patient) {
  const container = document.getElementById('doctorCurrentPatientContainer');
  const typeBadge = document.getElementById('doctorCurrentTokenType');
  const actions = document.getElementById('doctorCurrentActions');
  
  if (!patient) {
    currentDoctorPatientId = null;
    typeBadge.textContent = 'No Active Patient';
    typeBadge.className = 'badge';
    container.innerHTML = `
      <div style="text-align:center; padding: 2rem; color: var(--color-text-muted);">
        No patient is currently in consultation. Click "Call Next Patient" to begin.
      </div>
    `;
    actions.innerHTML = `<button class="btn btn-primary" id="doctorCallNextBtn" style="flex: 1;" onclick="doctorCallNext()">Call Next Patient</button>`;
    return;
  }
  
  currentDoctorPatientId = patient.id;
  
  const isEmergency = patient.is_priority || patient.priority_level === 'Critical';
  typeBadge.textContent = isEmergency ? '🚨 EMERGENCY PRIORITY' : 'Standard Appointment';
  typeBadge.className = isEmergency ? 'badge badge-urgent' : 'badge badge-success';
  
  const photoHtml = patient.photo_path 
    ? `<div style="margin-top:1rem;"><button class="photo-thumb-btn" onclick="openPhotoModal('/uploads/${patient.photo_path}', '${patient.patient_name}')">📷 View Uploaded Photo</button></div>`
    : '';
    
  container.innerHTML = `
    <div style="font-size:1.2rem; margin-bottom: 0.5rem;"><strong>Token: ${patient.token}</strong></div>
    <div style="font-size:1.5rem; margin-bottom: 0.5rem; font-weight:700;">${patient.patient_name}</div>
    <div style="color:var(--color-text-muted); margin-bottom: 0.5rem;">${patient.department}</div>
    ${patient.emergency_desc ? `<div class="pending-desc-quote">"${patient.emergency_desc}"</div>` : ''}
    ${photoHtml}
  `;
  
  actions.innerHTML = `
    <button class="btn btn-success" style="flex: 1; background: var(--color-sage);" onclick="doctorComplete()">✓ Mark Complete</button>
    <button class="btn btn-danger" style="flex: 1; background: var(--color-urgent-red); color:white;" onclick="doctorSkip()">✕ Skip / No Show</button>
  `;
}

async function doctorCallNext() {
  try {
    const res = await fetch(`${API_BASE}/api/doctor/call`, {
      method: 'POST',
      headers: { 'X-User-Role': state.currentUser.role }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Patient Called', 'The next patient has been called.', 'success');
      sounds.playChime('turn');
      fetchDoctorData();
    } else {
      showToast('Cannot Call Next', data.error, 'urgent');
    }
  } catch (err) {}
}

async function doctorComplete() {
  if (!currentDoctorPatientId) return;
  try {
    const res = await fetch(`${API_BASE}/api/doctor/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Role': state.currentUser.role },
      body: JSON.stringify({ id: currentDoctorPatientId })
    });
    if (res.ok) {
      showToast('Completed', 'Consultation marked as completed.', 'success');
      fetchDoctorData();
    }
  } catch (err) {}
}

async function doctorSkip() {
  if (!currentDoctorPatientId) return;
  if (!confirm('Are you sure you want to skip this patient? They will be removed from the active queue and given a reschedule option.')) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/doctor/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Role': state.currentUser.role },
      body: JSON.stringify({ id: currentDoctorPatientId, reason: 'Doctor Skipped / No Show' })
    });
    if (res.ok) {
      showToast('Skipped', 'Patient has been skipped.', 'normal');
      fetchDoctorData();
    }
  } catch (err) {}
}

// Global functions for inline HTML onclick
window.doctorCallNext = doctorCallNext;
window.doctorComplete = doctorComplete;
window.doctorSkip = doctorSkip;

// ============================================================================
// Modal & Utility Controls
// ============================================================================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('active'); document.body.style.overflow = ''; }
}

function setupPasswordToggle(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(toggleId);
  if (!input || !btn) return;

  btn.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
}

function checkPasswordStrength(value) {
  const el = document.getElementById('passwordStrength');
  if (!el) return;

  if (value.length === 0) { el.removeAttribute('data-strength'); return; }
  if (value.length < 6) el.setAttribute('data-strength', 'weak');
  else if (value.length < 10 || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) el.setAttribute('data-strength', 'medium');
  else el.setAttribute('data-strength', 'strong');
}

// ============================================================================
// Event Listeners Setup
// ============================================================================
function setupEventListeners() {

  setupRescheduleWheel();

  // Auth Forms
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const registerForm = document.getElementById('registerForm');
  if (registerForm) registerForm.addEventListener('submit', handleRegister);

  const goToGetAccess = document.getElementById('goToGetAccess');
  if (goToGetAccess) goToGetAccess.addEventListener('click', () => navigateTo('getaccess'));

  const goToLogin = document.getElementById('goToLogin');
  if (goToLogin) goToLogin.addEventListener('click', () => navigateTo('login'));

  const googleLoginBtn = document.getElementById('googleLoginBtn');
  if (googleLoginBtn) googleLoginBtn.addEventListener('click', () => {
    state.isLoggedIn = true;
    state.currentUser = { id: 99, name: 'Google User', email: 'user@gmail.com', role: 'user' };
    state.userName = 'Google User';
    updateNavUserPill();
    navigateTo('dashboard');
    fetchQueueStatusFromBackend();
    showToast('Signed in with Google!', 'Welcome to SmartQueue.', 'success');
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', handleLogout);

  const doctorLogoutBtn = document.getElementById('doctorLogoutBtn');
  if (doctorLogoutBtn) doctorLogoutBtn.addEventListener('click', handleLogout);

  setupPasswordToggle('loginPassword', 'loginPwdToggle');
  setupPasswordToggle('regPassword', 'regPwdToggle');

  const regPwd = document.getElementById('regPassword');
  if (regPwd) regPwd.addEventListener('input', (e) => checkPasswordStrength(e.target.value));

  setupRoleSelection();

  // File Upload Setup
  setupFileUpload('priorityPhotoDropzone', 'priorityPhotoInput', 'priorityFilePreview', 'priorityPreviewImg', 'priorityFileName', 'priorityRemovePhotoBtn');
  setupFileUpload('bookingPhotoDropzone', 'bookingPhotoInput', 'bookingFilePreview', 'bookingPreviewImg', 'bookingFileName', 'bookingRemovePhotoBtn');

  // Dashboard Nav Links
  const heroBookBtn = document.getElementById('heroBookBtn');
  if (heroBookBtn) heroBookBtn.addEventListener('click', () => navigateTo('book'));

  const navBookBtn = document.getElementById('navBookBtn');
  if (navBookBtn) navBookBtn.addEventListener('click', () => navigateTo('book'));

  const stepBookAction = document.getElementById('stepBookAction');
  if (stepBookAction) stepBookAction.addEventListener('click', () => navigateTo('book'));

  const navPriorityBtn = document.getElementById('navPriorityBtn');
  if (navPriorityBtn) navPriorityBtn.addEventListener('click', () => navigateTo('priority'));

  const requestPriorityBtn = document.getElementById('requestPriorityBtn');
  if (requestPriorityBtn) requestPriorityBtn.addEventListener('click', () => navigateTo('priority'));

  const heroPriorityPill = document.getElementById('heroPriorityPill');
  if (heroPriorityPill) heroPriorityPill.addEventListener('click', () => navigateTo('priority'));

  // Booking & Priority Forms
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) bookingForm.addEventListener('submit', handleBookingSubmit);

  const bookBackBtn = document.getElementById('bookBackBtn');
  if (bookBackBtn) bookBackBtn.addEventListener('click', () => navigateTo(state.currentUser.role === 'admin' ? 'admindashboard' : 'dashboard'));

  const cancelBookingBtn = document.getElementById('cancelBookingBtn');
  if (cancelBookingBtn) cancelBookingBtn.addEventListener('click', () => navigateTo(state.currentUser.role === 'admin' ? 'admindashboard' : 'dashboard'));

  const priorityForm = document.getElementById('priorityForm');
  if (priorityForm) priorityForm.addEventListener('submit', handlePrioritySubmit);

  const priorityBackBtn = document.getElementById('priorityBackBtn');
  if (priorityBackBtn) priorityBackBtn.addEventListener('click', () => navigateTo(state.currentUser.role === 'admin' ? 'admindashboard' : 'dashboard'));

  const priorityBackAfterSuccess = document.getElementById('priorityBackAfterSuccess');
  if (priorityBackAfterSuccess) priorityBackAfterSuccess.addEventListener('click', () => navigateTo('dashboard'));

  // Modals
  const closeSuccessModal = document.getElementById('closeSuccessModal');
  if (closeSuccessModal) closeSuccessModal.addEventListener('click', () => closeModal('bookingSuccessModal'));

  const successViewQueueBtn = document.getElementById('successViewQueueBtn');
  if (successViewQueueBtn) successViewQueueBtn.addEventListener('click', () => {
    closeModal('bookingSuccessModal');
    navigateTo('dashboard');
    setTimeout(() => openModal('queueBoardModal'), 300);
  });

  const successDashboardBtn = document.getElementById('successDashboardBtn');
  if (successDashboardBtn) successDashboardBtn.addEventListener('click', () => {
    closeModal('bookingSuccessModal');
    navigateTo('dashboard');
  });

  const openQueueBoardBtn = document.getElementById('openQueueBoardBtn');
  if (openQueueBoardBtn) openQueueBoardBtn.addEventListener('click', () => {
    openModal('queueBoardModal');
    updateQueueAnimation();
  });

  const stepTrackAction = document.getElementById('stepTrackAction');
  if (stepTrackAction) stepTrackAction.addEventListener('click', () => {
    openModal('queueBoardModal');
    updateQueueAnimation();
  });

  const closeBoardModal = document.getElementById('closeBoardModal');
  if (closeBoardModal) closeBoardModal.addEventListener('click', () => closeModal('queueBoardModal'));

  const closeBoardBtn = document.getElementById('closeBoardBtn');
  if (closeBoardBtn) closeBoardBtn.addEventListener('click', () => closeModal('queueBoardModal'));

  const closePhotoModal = document.getElementById('closePhotoModal');
  if (closePhotoModal) closePhotoModal.addEventListener('click', () => closeModal('photoViewModal'));

  const closePhotoModalBtn = document.getElementById('closePhotoModalBtn');
  if (closePhotoModalBtn) closePhotoModalBtn.addEventListener('click', () => closeModal('photoViewModal'));

  const confirmRescheduleBtn = document.getElementById('confirmRescheduleBtn');
  if (confirmRescheduleBtn) confirmRescheduleBtn.addEventListener('click', handleReschedule);

  // Simulator
  const simNextPatientBtn = document.getElementById('simNextPatientBtn');
  if (simNextPatientBtn) simNextPatientBtn.addEventListener('click', advanceQueue);

  const simAutoPlayBtn = document.getElementById('simAutoPlayBtn');
  if (simAutoPlayBtn) simAutoPlayBtn.addEventListener('click', toggleAutoPlay);

  const simResetQueueBtn = document.getElementById('simResetQueueBtn');
  if (simResetQueueBtn) simResetQueueBtn.addEventListener('click', resetQueue);

  const stepAdaptAction = document.getElementById('stepAdaptAction');
  if (stepAdaptAction) stepAdaptAction.addEventListener('click', () => {
    const section = document.getElementById('urgent-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  });

  const helpFab = document.getElementById('helpFab');
  if (helpFab) helpFab.addEventListener('click', () => openModal('helpModal'));

  const closeHelpModal = document.getElementById('closeHelpModal');
  if (closeHelpModal) closeHelpModal.addEventListener('click', () => closeModal('helpModal'));

  const closeHelpBtn = document.getElementById('closeHelpBtn');
  if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => closeModal('helpModal'));

  // Admin Master Tabs (Active vs History)
  document.querySelectorAll('#adminMasterTabs .filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('#adminMasterTabs .filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      const view = e.target.getAttribute('data-view');
      
      if (view === 'history') {
        document.getElementById('adminActiveView').classList.add('hidden');
        document.getElementById('adminHistoryView').classList.remove('hidden');
      } else {
        document.getElementById('adminHistoryView').classList.add('hidden');
        document.getElementById('adminActiveView').classList.remove('hidden');
      }
    });
  });

  // Admin Active Sub-Filters
  document.querySelectorAll('.sub-filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.sub-filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      state.adminFilter = e.target.getAttribute('data-filter') || 'all';
      renderAdminActiveQueue();
    });
  });
  
  // Admin Search Listeners
  const activeSearch = document.getElementById('adminActiveSearch');
  if (activeSearch) activeSearch.addEventListener('input', renderAdminActiveQueue);
  
  const historySearch = document.getElementById('adminHistorySearch');
  if (historySearch) historySearch.addEventListener('input', renderAdminHistoryQueue);

  const adminRefreshBtn = document.getElementById('adminRefreshBtn');
  if (adminRefreshBtn) adminRefreshBtn.addEventListener('click', () => {
    fetchAdminData();
    showToast('Data Refreshed', 'Admin statistics and emergency queue updated.', 'normal');
  });

  const doctorRefreshBtn = document.getElementById('doctorRefreshBtn');
  if (doctorRefreshBtn) doctorRefreshBtn.addEventListener('click', () => {
    fetchDoctorData();
    showToast('Data Refreshed', 'Doctor queue updated.', 'normal');
  });

  // Modal Backdrop Click
  ['queueBoardModal', 'bookingSuccessModal', 'helpModal', 'photoViewModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', (e) => { if (e.target === el) closeModal(id); });
  });
}

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('preferredDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;
  }

  setupEventListeners();

  // Default Landing Page is Login ('#page-login' is .active by default in HTML)
  // Check if session exists on load
  checkSessionOnLoad();
  fetchQueueStatusFromBackend();
});
