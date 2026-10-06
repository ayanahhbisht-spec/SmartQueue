/**
 * SmartQueue - Intelligent Queue Management System
 * Multi-Page Router + Interactive State Engine + Python Backend Client
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
  currentUser: { name: '', email: '', avatar: '' },

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
  book: document.getElementById('page-book'),
  priority: document.getElementById('page-priority'),
};

function navigateTo(pageId) {
  // Hide all pages
  Object.values(pages).forEach(p => {
    if (p) {
      p.classList.remove('active');
    }
  });

  // Show target page with animation
  const target = pages[pageId];
  if (target) {
    // Short delay to allow CSS transition to register
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
    // Set today as min date
    const dateInput = document.getElementById('preferredDate');
    if (dateInput) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.min = today;
      dateInput.value = today;
    }
  }
}

// ============================================================================
// Backend API
// ============================================================================
const API_BASE = window.location.origin.startsWith('http')
  ? window.location.origin
  : 'http://127.0.0.1:5000';

async function fetchQueueStatusFromBackend() {
  try {
    const res = await fetch(`${API_BASE}/api/queue/status`, { method: 'GET' });
    if (!res.ok) throw new Error('Backend not OK');
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

    updateUI();
  } catch (err) {
    state.isBackendConnected = false;
    updateUI();
  }
}

// ============================================================================
// UI Render & Sync
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
        ? 'status-priority' : 'status-confirmed'
    );
  }

  const fill = $('queueProgressFill');
  if (fill) {
    let pct = state.isPriority ? 94 : state.peopleAhead === 0 ? 98 : Math.min(95, Math.max(20, 100 - state.peopleAhead * 14));
    fill.style.width = `${pct}%`;
  }

  const alertText = $('urgentAlertText');
  if (alertText) {
    if (state.isPriority) {
      alertText.textContent = `Priority active — ${state.userToken} moved to position 2 (Calling Next)`;
    } else if (state.status && state.status.startsWith('Rescheduled')) {
      alertText.textContent = `Appointment rescheduled to new slot (${state.userToken})`;
    } else {
      alertText.textContent = 'Priority requested — moved to position 2';
    }
  }

  if ($('c1Token')) $('c1Token').textContent = `A-${state.nowServingNum}`;
  if ($('c2Token')) $('c2Token').textContent = `B-0${(state.nowServingNum % 8) + 1}`;
  if ($('c3Token')) $('c3Token').textContent = state.isPriority ? state.userToken : 'P-03';

  renderQueueTable();
  updateQueueAnimation();
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
// Animated Queue Scene — cute people standing in line
// ============================================================================
const personColors = ['green', 'blue', 'purple', 'orange', 'red'];
const personNames = [
  'James', 'Elena', 'Marcus', 'Aaliyah', 'David',
  'Lucia', 'Oliver', 'Amira', 'Sofia', 'Raj', 'Ming', 'Carlos'
];

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
  const displayPeople = waitingPeople.slice(0, 10); // max 10 in scene

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
// Actions: Priority, Booking, Rescheduling
// ============================================================================
async function activatePriorityAccess() {
  state.isPriority = true;
  state.status = 'Priority Expedited';
  state.estimatedWaitMinutes = 2;
  state.peopleAhead = 1;

  if (state.isBackendConnected) {
    try {
      await fetch(`${API_BASE}/api/queue/priority`, { method: 'POST' });
      await fetchQueueStatusFromBackend();
    } catch (e) { }
  } else {
    const idx = state.queueList.findIndex(i => i.token === state.userToken);
    if (idx > -1) {
      const item = state.queueList.splice(idx, 1)[0];
      item.status = 'Next Calling (Priority)';
      item.wait = 2;
      state.queueList.splice(1, 0, item);
    }
    updateUI();
  }

  showToast('Priority Triage Activated', `Token ${state.userToken} moved to Position 2. Est. wait: 2 mins.`, 'urgent');
}

async function handleReschedule(option) {
  state.isPriority = false;
  const msg = document.getElementById('rescheduleStatusMsg');

  if (state.isBackendConnected) {
    try {
      const res = await fetch(`${API_BASE}/api/queue/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option })
      });
      const data = await res.json();
      await fetchQueueStatusFromBackend();
      showToast('Slot Rescheduled', data.message, option === 'cancel' ? 'urgent' : 'reschedule');
      return;
    } catch (e) { }
  }

  if (option === '30m') {
    state.userToken = 'A-32'; state.userTokenNum = state.nowServingNum + 6;
    state.status = 'Rescheduled (30m)'; state.estimatedWaitMinutes = 30;
    if (msg) msg.innerHTML = '<span>✓ Rescheduled for <strong>In 30 minutes</strong> (New token: A-32)</span>';
    showToast('Slot Rescheduled', 'Moved +30 minutes. New token: A-32.', 'reschedule');
  } else if (option === '2h') {
    state.userToken = 'B-08'; state.userTokenNum = state.nowServingNum + 16;
    state.status = 'Rescheduled (2h)'; state.estimatedWaitMinutes = 120;
    if (msg) msg.innerHTML = '<span>✓ Rescheduled for <strong>In 2 hours</strong> (New token: B-08)</span>';
    showToast('Slot Rescheduled', 'Moved +2 hours. New token: B-08.', 'reschedule');
  } else if (option === 'tomorrow') {
    state.userToken = 'T-04'; state.userTokenNum = 104;
    state.status = 'Rescheduled (Tomorrow)'; state.estimatedWaitMinutes = 960;
    if (msg) msg.innerHTML = '<span>✓ Rescheduled for <strong>Tomorrow at 09:15 AM</strong> (Token: T-04)</span>';
    showToast('Booked for Tomorrow', 'Saved for tomorrow at 09:15 AM. SMS reminder set.', 'reschedule');
  } else if (option === 'cancel') {
    state.status = 'Cancelled';
    if (msg) msg.innerHTML = '<span style="color:#B91C1C;">✕ Appointment cancelled. You may re-book anytime.</span>';
    showToast('Appointment Cancelled', 'Queue slot released. No fee charged.', 'urgent');
  }

  updateUI();
}

async function advanceQueue() {
  if (state.isBackendConnected) {
    try {
      const res = await fetch(`${API_BASE}/api/queue/next`, { method: 'POST' });
      const data = await res.json();
      await fetchQueueStatusFromBackend();
      if (data.is_user_turn) {
        showToast("It's Your Turn!", `Token ${state.userToken} called to Counter 1.`, 'success');
      } else {
        showToast('Queue Advanced', `Now serving: ${data.now_serving_token}.`, 'normal');
      }
      return;
    } catch (e) { }
  }

  if (state.nowServingNum >= state.userTokenNum) {
    showToast('Turn Reached!', `Now serving token ${state.userToken}. Go to Counter 1.`, 'success');
    state.status = 'Calling Now'; updateUI(); return;
  }

  state.nowServingNum += 1;
  if (state.nowServingNum === state.userTokenNum) {
    state.status = 'Calling Now';
    showToast("It's Your Turn!", `Token ${state.userToken} called to Counter 1.`, 'success');
  } else {
    showToast('Queue Advanced', `Now serving: A-${state.nowServingNum}.`, 'normal');
  }

  updateUI();
}

async function resetQueue() {
  if (state.autoPlayTimer) {
    clearInterval(state.autoPlayTimer);
    state.isAutoPlaying = false;
    const btn = document.getElementById('simAutoPlayBtn');
    if (btn) btn.textContent = '▶ Auto-Play';
  }

  if (state.isBackendConnected) {
    try {
      await fetch(`${API_BASE}/api/queue/reset`, { method: 'POST' });
      await fetchQueueStatusFromBackend();
      showToast('Queue Reset', 'Simulator restored to initial state.', 'normal');
      return;
    } catch (e) { }
  }

  state.userToken = 'A-24'; state.userName = 'Sarah Jenkins';
  state.userService = 'General Consultation'; state.nowServingNum = 18;
  state.userTokenNum = 24; state.isPriority = false; state.status = 'Confirmed';

  const msg = document.getElementById('rescheduleStatusMsg');
  if (msg) msg.innerHTML = '<span>✓ Click any option to simulate instant smart slot reassignment</span>';

  state.queueList = [
    { token: 'A-18', name: 'James Wilson', service: 'General Medicine', status: 'In Consultation', wait: 0 },
    { token: 'A-19', name: 'Elena Rostova', service: 'General Medicine', status: 'Next Calling', wait: 1 },
    { token: 'A-20', name: 'Marcus Chen', service: 'Dental Clinic', status: 'Waiting', wait: 2 },
    { token: 'A-21', name: 'Aaliyah Patel', service: 'Radiology & Imaging', status: 'Waiting', wait: 3 },
    { token: 'A-22', name: 'David Kim', service: 'Pediatrics Care', status: 'Waiting', wait: 4 },
    { token: 'A-23', name: 'Lucia Morales', service: 'General Consultation', status: 'Waiting', wait: 4 },
    { token: 'A-24', name: 'Sarah Jenkins', service: 'General Consultation', status: 'Confirmed', wait: 5, isUser: true },
    { token: 'A-25', name: 'Oliver Brown', service: 'General Consultation', status: 'Waiting', wait: 8 },
    { token: 'A-26', name: 'Amira Hassan', service: 'Laboratory Tests', status: 'Waiting', wait: 11 },
  ];

  updateUI();
  showToast('Queue Reset', 'Simulator restored to initial state.', 'normal');
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
// Modal Controls
// ============================================================================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('active'); document.body.style.overflow = ''; }
}

// ============================================================================
// Auth Handlers
// ============================================================================
function handleLogin(e) {
  e.preventDefault();

  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const submitBtn = document.getElementById('loginSubmitBtn');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  const loader = document.getElementById('loginLoader');

  // Show loader
  if (btnText) btnText.classList.add('hidden');
  if (loader) loader.classList.remove('hidden');

  // Simulate auth delay
  setTimeout(() => {
    const email = emailInput ? emailInput.value.trim() : 'user@example.com';
    const name = email.split('@')[0];
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);

    state.isLoggedIn = true;
    state.currentUser = { name: displayName, email };
    state.userName = displayName;

    // Update nav user info
    const navName = document.getElementById('navUserName');
    const navAvatar = document.getElementById('navUserAvatar');
    if (navName) navName.textContent = displayName.split(' ')[0];
    if (navAvatar) navAvatar.textContent = displayName.charAt(0).toUpperCase();

    if (btnText) btnText.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');

    navigateTo('dashboard');
    fetchQueueStatusFromBackend();
    showToast('Welcome back!', `Signed in as ${displayName}. Your queue is active.`, 'success');
  }, 1200);
}

function handleRegister(e) {
  e.preventDefault();

  const firstName = document.getElementById('regFirstName');
  const lastName = document.getElementById('regLastName');
  const email = document.getElementById('regEmail');
  const submitBtn = document.getElementById('registerSubmitBtn');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  const loader = document.getElementById('registerLoader');

  if (btnText) btnText.classList.add('hidden');
  if (loader) loader.classList.remove('hidden');

  setTimeout(() => {
    const fullName = `${firstName ? firstName.value : ''} ${lastName ? lastName.value : ''}`.trim();
    const userEmail = email ? email.value.trim() : 'user@example.com';

    state.isLoggedIn = true;
    state.currentUser = { name: fullName, email: userEmail };
    state.userName = fullName || 'New User';

    const navName = document.getElementById('navUserName');
    const navAvatar = document.getElementById('navUserAvatar');
    if (navName) navName.textContent = fullName.split(' ')[0] || 'User';
    if (navAvatar) navAvatar.textContent = (fullName.charAt(0) || 'U').toUpperCase();

    if (btnText) btnText.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');

    navigateTo('dashboard');
    fetchQueueStatusFromBackend();
    showToast('Account Created!', `Welcome to SmartQueue, ${fullName || 'friend'}! Book your first appointment.`, 'success');
  }, 1500);
}

function handleLogout() {
  state.isLoggedIn = false;
  state.currentUser = { name: '', email: '' };
  navigateTo('login');
  showToast('Logged out', 'You have been signed out successfully.', 'normal');
}

// ============================================================================
// Booking Page Handler
// ============================================================================
async function handleBookingSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('patientName');
  const phone = document.getElementById('patientPhone');
  const service = document.getElementById('serviceDepartment');
  const isUrgent = document.getElementById('bookWithPriority');
  const btn = document.getElementById('confirmBookingBtn');

  const patientName = name ? name.value.trim() : 'Patient';
  const patientPhone = phone ? phone.value.trim() : '';
  const department = service ? service.value : 'General Consultation';
  const urgent = isUrgent ? isUrgent.checked : false;

  if (btn) { btn.textContent = 'Generating token...'; btn.disabled = true; }

  let tokenData = null;

  if (state.isBackendConnected) {
    try {
      const res = await fetch(`${API_BASE}/api/appointments/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_name: patientName, phone: patientPhone, department, is_priority: urgent })
      });
      tokenData = await res.json();
      await fetchQueueStatusFromBackend();
    } catch (e) { }
  }

  if (!tokenData) {
    const prefix = department.startsWith('Pediatric') ? 'P' : department.startsWith('Cardio') ? 'C' : department.startsWith('Dental') ? 'D' : 'A';
    const num = Math.floor(Math.random() * 15) + 27;
    const token = `${prefix}-${num}`;

    state.userName = patientName;
    state.userService = department;
    state.userToken = token;
    state.userTokenNum = num;
    state.isPriority = urgent;
    state.status = urgent ? 'Priority Expedited' : 'Confirmed';
    state.queueList.push({ token, name: patientName, service: department, status: urgent ? 'Priority Calling' : 'Confirmed', wait: urgent ? 2 : 12, isUser: true });
    updateUI();

    tokenData = { token, patient_name: patientName, department, is_priority: urgent, status: state.status, estimated_wait: urgent ? 2 : 12 };
  }

  if (btn) { btn.textContent = 'Generate Token and Join Queue'; btn.disabled = false; }

  // Show success modal
  const tokenEl = document.getElementById('successTokenDisplay');
  const msgEl = document.getElementById('successMessage');
  const detailsEl = document.getElementById('successDetails');

  if (tokenEl) tokenEl.textContent = `Your Token: ${tokenData.token}`;
  if (msgEl) msgEl.textContent = urgent
    ? 'Priority access granted! You are near the front of the queue.'
    : 'Successfully joined the queue. You will receive an SMS alert when it is almost your turn.';
  if (detailsEl) detailsEl.innerHTML = `
    <div>Department: <strong>${tokenData.department || department}</strong></div>
    <div>Status: <strong>${tokenData.status || state.status}</strong></div>
    <div>Estimated wait: <strong>${tokenData.estimated_wait || state.estimatedWaitMinutes} min</strong></div>
  `;

  openModal('bookingSuccessModal');
}

// ============================================================================
// Priority Page Handler
// ============================================================================
async function handlePrioritySubmit(e) {
  e.preventDefault();

  const btn = document.getElementById('confirmPriorityBtn');
  const result = document.getElementById('priorityResult');
  const form = document.getElementById('priorityForm');

  if (btn) { btn.textContent = 'Processing...'; btn.disabled = true; }

  await activatePriorityAccess();

  setTimeout(() => {
    if (btn) { btn.textContent = 'Activate Emergency Priority Access'; btn.disabled = false; }

    if (form) form.style.display = 'none';
    if (result) result.classList.remove('hidden');

    const msgEl = document.getElementById('priorityResultMsg');
    const tokenEl = document.getElementById('priorityNewToken');
    if (msgEl) msgEl.textContent = `You've been moved to position 2. Estimated wait: 2 minutes.`;
    if (tokenEl) tokenEl.textContent = state.userToken;
  }, 800);
}

// ============================================================================
// Password Strength Checker
// ============================================================================
function checkPasswordStrength(value) {
  const el = document.getElementById('passwordStrength');
  if (!el) return;

  if (value.length === 0) { el.removeAttribute('data-strength'); return; }
  if (value.length < 6) el.setAttribute('data-strength', 'weak');
  else if (value.length < 10 || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) el.setAttribute('data-strength', 'medium');
  else el.setAttribute('data-strength', 'strong');
}

// ============================================================================
// Password Toggle
// ============================================================================
function setupPasswordToggle(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(toggleId);
  if (!input || !btn) return;

  btn.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
}

// ============================================================================
// Event Listeners Setup
// ============================================================================
function setupEventListeners() {

  // ─── Auth Pages ────────────────────────────────────────────
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
    // Simulate Google login
    state.isLoggedIn = true;
    state.currentUser = { name: 'Google User', email: 'user@gmail.com' };
    state.userName = 'Google User';
    const navName = document.getElementById('navUserName');
    const navAvatar = document.getElementById('navUserAvatar');
    if (navName) navName.textContent = 'User';
    if (navAvatar) navAvatar.textContent = 'G';
    navigateTo('dashboard');
    fetchQueueStatusFromBackend();
    showToast('Signed in with Google!', 'Welcome to SmartQueue.', 'success');
  });

  // Password toggles
  setupPasswordToggle('loginPassword', 'loginPwdToggle');
  setupPasswordToggle('regPassword', 'regPwdToggle');

  // Password strength
  const regPwd = document.getElementById('regPassword');
  if (regPwd) regPwd.addEventListener('input', (e) => checkPasswordStrength(e.target.value));

  // ─── Dashboard Navigation ────────────────────────────────────
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

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

  // ─── Book Page ────────────────────────────────────────────────
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) bookingForm.addEventListener('submit', handleBookingSubmit);

  const bookBackBtn = document.getElementById('bookBackBtn');
  if (bookBackBtn) bookBackBtn.addEventListener('click', () => navigateTo('dashboard'));

  const cancelBookingBtn = document.getElementById('cancelBookingBtn');
  if (cancelBookingBtn) cancelBookingBtn.addEventListener('click', () => navigateTo('dashboard'));

  // ─── Priority Page ────────────────────────────────────────────
  const priorityForm = document.getElementById('priorityForm');
  if (priorityForm) priorityForm.addEventListener('submit', handlePrioritySubmit);

  const priorityBackBtn = document.getElementById('priorityBackBtn');
  if (priorityBackBtn) priorityBackBtn.addEventListener('click', () => navigateTo('dashboard'));

  const priorityBackAfterSuccess = document.getElementById('priorityBackAfterSuccess');
  if (priorityBackAfterSuccess) priorityBackAfterSuccess.addEventListener('click', () => navigateTo('dashboard'));

  // ─── Booking Success Modal ───────────────────────────────────
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

  // ─── Queue Board Modal ───────────────────────────────────────
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

  // ─── Reschedule Pills ────────────────────────────────────────
  const reschedule30m = document.getElementById('reschedule30m');
  if (reschedule30m) reschedule30m.addEventListener('click', () => handleReschedule('30m'));

  const reschedule2h = document.getElementById('reschedule2h');
  if (reschedule2h) reschedule2h.addEventListener('click', () => handleReschedule('2h'));

  const rescheduleTomorrow = document.getElementById('rescheduleTomorrow');
  if (rescheduleTomorrow) rescheduleTomorrow.addEventListener('click', () => handleReschedule('tomorrow'));

  const rescheduleCancel = document.getElementById('rescheduleCancel');
  if (rescheduleCancel) rescheduleCancel.addEventListener('click', () => handleReschedule('cancel'));

  // ─── Simulator Controls ──────────────────────────────────────
  const simNextPatientBtn = document.getElementById('simNextPatientBtn');
  if (simNextPatientBtn) simNextPatientBtn.addEventListener('click', advanceQueue);

  const simAutoPlayBtn = document.getElementById('simAutoPlayBtn');
  if (simAutoPlayBtn) simAutoPlayBtn.addEventListener('click', toggleAutoPlay);

  const simResetQueueBtn = document.getElementById('simResetQueueBtn');
  if (simResetQueueBtn) simResetQueueBtn.addEventListener('click', resetQueue);

  // ─── Adapt Section Link ──────────────────────────────────────
  const stepAdaptAction = document.getElementById('stepAdaptAction');
  if (stepAdaptAction) stepAdaptAction.addEventListener('click', () => {
    const section = document.getElementById('urgent-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  });

  // ─── Help FAB ────────────────────────────────────────────────
  const helpFab = document.getElementById('helpFab');
  if (helpFab) helpFab.addEventListener('click', () => openModal('helpModal'));

  const closeHelpModal = document.getElementById('closeHelpModal');
  if (closeHelpModal) closeHelpModal.addEventListener('click', () => closeModal('helpModal'));

  const closeHelpBtn = document.getElementById('closeHelpBtn');
  if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => closeModal('helpModal'));

  // ─── Backdrop Click Closes Modals ───────────────────────────
  ['queueBoardModal', 'bookingSuccessModal', 'helpModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', (e) => { if (e.target === el) closeModal(id); });
  });
}

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Set date input default
  const dateInput = document.getElementById('preferredDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;
  }

  setupEventListeners();

  // Start on Login page (it's already .active in HTML)
  // Don't auto-navigate to dashboard unless logged in

  // Try backend silently, use local data either way
  fetchQueueStatusFromBackend();
});
