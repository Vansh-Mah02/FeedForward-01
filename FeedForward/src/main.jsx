let activeFilter = 'all';
let searchTerm = '';
let sortOrder = 'newest';
let allListings = [];
let mainMap = null;
let miniMap = null;
let miniMarker = null;
let mainMapLayer = 'listings';
let postCoords = null;
let geocodeTimeout = null;
let currentSession = null;

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  currentSession = AuthAPI.getSession();
  updateNavForSession();
  renderSteps('donor');
  await loadListings();
  initMainMap();
  loadImpactStats();
  animateCounters();
  initScrollReveal();
  setDefaultTimes();
});

function setDefaultTimes() {
  const now = new Date();
  const from = new Date(now.getTime() + 30*60000);
  const to   = new Date(now.getTime() + 4*3600000);
  const fmt  = d => d.toTimeString().slice(0,5);
  const f = document.getElementById('availableFrom');
  const t = document.getElementById('availableTo');
  if (f) f.value = fmt(from);
  if (t) t.value = fmt(to);
}

// ── SESSION / NAV ────────────────────────────────────────────
function updateNavForSession() {
  currentSession = AuthAPI.getSession();
  const cta  = document.getElementById('navCta');
  const user = document.getElementById('navUser');
  const badge = document.getElementById('userBadge');
  if (!currentSession) { cta.classList.remove('hidden'); user.classList.add('hidden'); return; }
  cta.classList.add('hidden'); user.classList.remove('hidden');
  const roleIcon = currentSession.role === 'ngo' ? '🤝' : '🍽️';
  const vs = currentSession.verificationStatus === 'verified' ? '✅' : currentSession.verificationStatus === 'pending' ? '⏳' : '⚠️';
  badge.textContent = `${roleIcon} ${currentSession.name} ${vs}`;
}

function logout() {
  AuthAPI.logout();
  currentSession = null;
  updateNavForSession();
  showToast('You have been signed out.');
  loadListings();
}

// ── TABS ────────────────────────────────────────────────────
const STEPS = {
  donor:[
    {icon:'📝',num:'01',title:'Register & Verify',desc:'Quick one-time signup. We verify your food safety credentials and you\'re live within minutes.'},
    {icon:'📣',num:'02',title:'Post Your Surplus',desc:'Fill in food details, enter your address (auto-geocoded to map), set pickup window. Done in under 2 min.'},
    {icon:'🤝',num:'03',title:'NGO Picks It Up',desc:'Verified NGOs nearby are notified instantly. Accept their claim and coordinate pickup directly.'},
  ],
  ngo:[
    {icon:'✅',num:'01',title:'Register & Get Verified',desc:'Submit your NGO registration number. Our system cross-checks against government records within 24h.'},
    {icon:'🔔',num:'02',title:'Browse or Get Alerts',desc:'See live food listings on the map near you, or receive instant alerts when surplus is posted.'},
    {icon:'🚚',num:'03',title:'Claim & Collect',desc:'One-tap claim, direct donor contact details, and a pickup confirmation flow.'},
  ]
};

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('tab-' + tab);
  if (el) el.classList.add('active');
  renderSteps(tab);
  if (tab === 'ngo') document.getElementById('dashboard')?.scrollIntoView({ behavior:'smooth' });
}

function renderSteps(tab) {
  const grid = document.getElementById('stepsGrid');
  if (!grid) return;
  grid.style.opacity = '0';
  setTimeout(() => {
    grid.innerHTML = STEPS[tab].map(s => `
      <div class="step-card">
        <span class="step-num">${s.num}</span>
        <span class="step-icon">${s.icon}</span>
        <h3>${s.title}</h3>
        <p>${s.desc}</p>
      </div>`).join('');
    grid.style.opacity = '1';
  }, 150);
}

// ── LOAD LISTINGS ────────────────────────────────────────────
async function loadListings() {
  allListings = await ListingsAPI.getAll();
  renderListings();
  updateLiveBadge();
  if (mainMap) refreshMapMarkers();
}

function updateLiveBadge() {
  const active = allListings.filter(l => l.status === 'active').length;
  const el = document.getElementById('liveBadgeCount');
  if (el) el.textContent = `${active} live listing${active !== 1 ? 's' : ''} right now`;
}

// ── FILTERS & SORT ───────────────────────────────────────────
function setFilter(f, btn) {
  activeFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderListings();
}

function filterListings() {
  searchTerm = document.getElementById('searchInput').value.toLowerCase();
  renderListings();
}

function setSortOrder(v) { sortOrder = v; renderListings(); }

function getFilteredListings() {
  let list = allListings.filter(l => {
    const matchF = activeFilter === 'all' || l.type === activeFilter;
    const matchS = !searchTerm ||
      l.title.toLowerCase().includes(searchTerm) ||
      l.donorName?.toLowerCase().includes(searchTerm) ||
      l.location?.toLowerCase().includes(searchTerm) ||
      l.diet?.toLowerCase().includes(searchTerm);
    return matchF && matchS;
  });
  const urgency = l => calcUrgency ? calcUrgency(l.expiresAt) : (l.urgency || 0);
  if (sortOrder === 'urgency') list.sort((a,b) => urgency(b) - urgency(a));
  else if (sortOrder === 'quantity') list.sort((a,b) => (b.qty||0) - (a.qty||0));
  else list.sort((a,b) => new Date(b.postedAt) - new Date(a.postedAt));
  return list;
}

// ── RENDER LISTINGS ──────────────────────────────────────────
const DIET_TAG = { veg:'🌿 Veg', nonveg:'🍖 Non-Veg', vegan:'🌱 Vegan', halal:'☪️ Halal', jain:'🕊️ Jain' };
const DIET_CLASS = { veg:'tag-veg', nonveg:'tag-nonveg', vegan:'tag-vegan', halal:'tag-halal', jain:'tag-jain' };
const TYPE_EMOJI = { restaurant:'🍽️', event:'🎪', catering:'🍱', bakery:'🥐' };

function renderListings() {
  const grid = document.getElementById('listingsGrid');
  if (!grid) return;
  const filtered = getFilteredListings();
  if (!filtered.length) {
    grid.innerHTML = `<div class="no-results"><p>No listings match your search 🔍</p><p style="font-size:.875rem;margin-top:.5rem;color:#a07860">Try a different filter or search term</p></div>`;
    return;
  }
  grid.innerHTML = '';
  filtered.forEach((l, i) => {
    const card = createListingCard(l, i);
    grid.appendChild(card);
    // stagger urgency bar animation
    setTimeout(() => {
      const bar = card.querySelector('.urgency-fill');
      if (bar) bar.style.width = bar.dataset.w + '%';
    }, 80 + i * 50);
  });
}

function timeLeft(expiresAt) {
  const diff = (new Date(expiresAt) - Date.now()) / 60000;
  if (diff <= 0) return '⏰ Expired';
  if (diff < 60) return `⚡ ${Math.round(diff)}m left`;
  if (diff < 1440) return `🕐 ${Math.round(diff/60)}h left`;
  return `📅 ${Math.round(diff/1440)}d left`;
}

function urgencyColor(u) {
  if (u >= 80) return '#C0392B';
  if (u >= 50) return '#E07B2A';
  return '#4A8C42';
}

function createListingCard(l, index) {
  const card = document.createElement('div');
  card.className = 'listing-card';
  card.style.animationDelay = `${index * 0.06}s`;
  const urg = l.urgency || 50;
  const isClaimed = l.status === 'claimed';
  const dietTag = `<span class="lc-tag ${DIET_CLASS[l.diet]||'tag-veg'}">${DIET_TAG[l.diet]||l.diet}</span>`;
  const typeTag = `<span class="lc-tag tag-type">${TYPE_EMOJI[l.type]||''} ${l.type}</span>`;
  const claimedTag = isClaimed ? `<span class="lc-tag tag-claimed">✓ Claimed</span>` : '';
  const canClaim = !isClaimed && currentSession?.role === 'ngo' && currentSession?.verificationStatus === 'verified';
  const ngoNote = !currentSession ? `<button class="btn-claim" onclick="openModal('login')">Sign in to Claim</button>` :
    currentSession.role !== 'ngo' ? `<span class="btn-claim disabled-info">NGOs only</span>` :
    currentSession.verificationStatus !== 'verified' ? `<button class="btn-claim" onclick="openModal('verify-ngo')">Verify NGO first</button>` :
    isClaimed ? `<button class="btn-claim" disabled>Claimed ✓</button>` :
    `<button class="btn-claim" onclick="claimListing('${l.id}',this)">Claim Food</button>`;

  card.innerHTML = `
    <div class="urgency-bar"><div class="urgency-fill" style="width:0%;background:${urgencyColor(urg)}" data-w="${urg}"></div></div>
    <div class="lc-header">
      <span class="lc-emoji">${l.emoji||'🍽️'}</span>
      <div class="lc-meta">
        <div class="lc-title">${l.title}</div>
        <div class="lc-source">${l.donorName}</div>
      </div>
      <span class="time-pill ${urg>=80?'urgent':''}">${timeLeft(l.expiresAt)}</span>
    </div>
    <div class="lc-body">
      <div class="lc-tags">${dietTag}${typeTag}${claimedTag}</div>
      <div class="lc-info">
        <div class="lc-info-item"><span class="lc-info-label">Quantity</span><span class="lc-info-val">${l.qty} ${l.unit}</span></div>
        <div class="lc-info-item"><span class="lc-info-label">Urgency</span><span class="lc-info-val" style="color:${urgencyColor(urg)}">${urg >= 80 ? '🔴 High' : urg >= 50 ? '🟡 Medium' : '🟢 Low'}</span></div>
        <div class="lc-info-item" style="grid-column:1/-1"><span class="lc-info-label">📍 Location</span><span class="lc-info-val">${l.location}</span></div>
      </div>
    </div>
    <div class="lc-footer">
      ${ngoNote}
      <button class="btn-details" onclick="viewDetails('${l.id}')">View →</button>
    </div>`;
  return card;
}

// ── CLAIM ─────────────────────────────────────────────────
async function claimListing(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
  const result = await ListingsAPI.claim(id);
  if (result.success) {
    await loadListings();
    showToast('✅ Claimed! Donor contact details sent to your account.', 'success');
  } else {
    if (btn) { btn.disabled = false; btn.textContent = 'Claim Food'; }
    showToast(result.message, 'error');
  }
}

// ── VIEW DETAILS MODAL ───────────────────────────────────────
function viewDetails(id) {
  const l = allListings.find(x => x.id === id);
  if (!l) return;
  const urg = l.urgency || 50;
  const mapLink = `https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}&zoom=16`;
  const isClaimed = l.status === 'claimed';

  openModalWithContent(`
    <div class="detail-modal">
      <div class="detail-emoji">${l.emoji||'🍽️'}</div>
      <h2 class="modal-title">${l.title}</h2>
      <p class="modal-sub" style="margin-bottom:1.5rem">${l.donorName} · ${timeLeft(l.expiresAt)}</p>
      <div class="detail-grid">
        ${[
          ['Quantity', `${l.qty} ${l.unit}`],
          ['Dietary', DIET_TAG[l.diet]||l.diet],
          ['Category', l.type],
          ['Urgency', urg>=80?'🔴 High':urg>=50?'🟡 Medium':'🟢 Low'],
          ['Available Until', new Date(l.expiresAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})],
          ['Contact', currentSession ? l.donorPhone : '🔒 Sign in to view'],
        ].map(([k,v]) => `<div class="detail-row"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('')}
      </div>
      <div class="detail-address">
        <span>📍 ${l.location}</span>
        <a href="${mapLink}" target="_blank" class="map-link">Open in Maps ↗</a>
      </div>
      ${l.notes ? `<div class="detail-notes">📋 ${l.notes}</div>` : ''}
      <div style="margin-top:1.5rem;display:flex;gap:.75rem">
        ${!isClaimed && currentSession?.role==='ngo' && currentSession?.verificationStatus==='verified'
          ? `<button class="modal-btn-primary" onclick="claimListing('${l.id}');closeModal()">Claim This Food →</button>`
          : isClaimed
          ? `<button class="modal-btn-primary" disabled>Already Claimed ✓</button>`
          : `<button class="modal-btn-primary" onclick="openModal('login');closeModal()">Sign in to Claim</button>`}
        <button class="btn-details" style="flex:0" onclick="closeModal()">Close</button>
      </div>
    </div>`);
}

// ── POST SURPLUS ──────────────────────────────────────────────
function scrollToPost() {
  document.getElementById('listings')?.scrollIntoView({ behavior:'smooth' });
}

let geocoding = false;
function debounceGeocode() {
  clearTimeout(geocodeTimeout);
  geocodeTimeout = setTimeout(() => geocodeAddress(), 600);
}

async function geocodeAddress() {
  const input = document.getElementById('foodLocation').value.trim();
  if (input.length < 4) return;
  const suggestions = document.getElementById('geocodeSuggestions');
  suggestions.innerHTML = '<div class="geo-loading">🔍 Searching…</div>';
  suggestions.classList.remove('hidden');
  const results = await GeoAPI.geocode(input);
  if (!results.length) { suggestions.innerHTML = '<div class="geo-loading">No results found</div>'; return; }
  suggestions.innerHTML = results.map((r,i) => `
    <div class="geo-item" onclick="selectGeocode(${r.lat},${r.lng},'${r.display_name.replace(/'/g,"&#39;")}')">
      📍 ${r.display_name}
    </div>`).join('');
}

function selectGeocode(lat, lng, name) {
  postCoords = { lat, lng };
  document.getElementById('foodLocation').value = name;
  document.getElementById('geocodeSuggestions').classList.add('hidden');
  showMiniMap(lat, lng);
}

function showMiniMap(lat, lng) {
  const wrap = document.getElementById('miniMapWrap');
  wrap.classList.remove('hidden');

  if (!miniMap) {
    miniMap = L.map('miniMap', { zoomControl: true, scrollWheelZoom: false }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(miniMap);
    const greenIcon = L.divIcon({ html: '<div class="map-marker-green">🍽️</div>', className:'', iconSize:[36,36], iconAnchor:[18,36] });
    miniMarker = L.marker([lat, lng], { icon: greenIcon, draggable: true }).addTo(miniMap);
    miniMarker.on('dragend', async (e) => {
      const pos = e.target.getLatLng();
      postCoords = { lat: pos.lat, lng: pos.lng };
      const addr = await GeoAPI.reverseGeocode(pos.lat, pos.lng);
      document.getElementById('foodLocation').value = addr;
      document.getElementById('miniMapNote').textContent = `📍 Pinned: ${addr.split(',').slice(0,2).join(',')}`;
    });
  } else {
    miniMap.setView([lat, lng], 15);
    miniMarker.setLatLng([lat, lng]);
  }
  setTimeout(() => miniMap.invalidateSize(), 100);
}

async function submitListing() {
  const title    = document.getElementById('foodName').value.trim();
  const qty      = document.getElementById('foodQty').value;
  const unit     = document.getElementById('foodUnit').value;
  const diet     = document.getElementById('foodDiet').value;
  const location = document.getElementById('foodLocation').value.trim();
  const to       = document.getElementById('availableTo').value;
  const notes    = document.getElementById('foodNotes').value.trim();
  const name     = document.getElementById('donorName').value.trim();
  const phone    = document.getElementById('donorPhone').value.trim();
  const dtype    = document.querySelector('input[name="dtype"]:checked').value;

  if (!title || !qty || !location || !to || !name || !phone) {
    showToast('⚠️ Please fill in all required fields.', 'error'); return;
  }

  // If no geocode selected, geocode now
  if (!postCoords) {
    const results = await GeoAPI.geocode(location);
    if (results.length) postCoords = { lat: results[0].lat, lng: results[0].lng };
    else postCoords = { lat: 28.6139 + (Math.random()-0.5)*0.2, lng: 77.2090 + (Math.random()-0.5)*0.2 };
  }

  const todayDate = new Date().toISOString().split('T')[0];
  const expiresAt = new Date(`${todayDate}T${to}:00`).toISOString();

  const emojiMap = { restaurant:'🍛', event:'🎂', catering:'🍱', bakery:'🥐' };
  const btn = document.getElementById('postSubmitBtn');
  btn.disabled = true; btn.textContent = 'Posting…';

  const result = await ListingsAPI.create({
    title, qty: parseInt(qty), unit, diet, location,
    lat: postCoords.lat, lng: postCoords.lng,
    expiresAt, notes, donorName: name, donorPhone: phone,
    type: dtype, emoji: emojiMap[dtype]||'🍽️',
  });

  btn.disabled = false;
  btn.innerHTML = 'Post Surplus Now <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  if (result.success) {
    ['foodName','foodQty','foodLocation','foodNotes','donorName','donorPhone'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    postCoords = null;
    document.getElementById('miniMapWrap').classList.add('hidden');
    document.getElementById('geocodeSuggestions').classList.add('hidden');
    await loadListings();
    showToast('🎉 Listing posted! Nearby NGOs have been notified.', 'success');
    document.getElementById('dashboard')?.scrollIntoView({ behavior:'smooth' });
  } else {
    showToast(result.message || 'Error posting listing.', 'error');
  }
}

// ── MAIN MAP ──────────────────────────────────────────────────
function initMainMap() {
  const mapEl = document.getElementById('mainMap');
  if (!mapEl || mainMap) return;
  mainMap = L.map('mainMap', { zoomControl: true, scrollWheelZoom: true }).setView([28.6139, 77.2090], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors', maxZoom:19
  }).addTo(mainMap);
  refreshMapMarkers();
}

function refreshMapMarkers() {
  if (!mainMap) return;
  mainMap.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.CircleMarker) mainMap.removeLayer(l); });

  const showListings = mainMapLayer !== 'ngos';
  const showNGOs = mainMapLayer !== 'listings';

  if (showListings) {
    allListings.filter(l => l.lat && l.status === 'active').forEach(l => {
      const icon = L.divIcon({ html:`<div class="map-pin food-pin">${l.emoji||'🍽️'}<span class="pin-qty">${l.qty}${l.unit[0]}</span></div>`, className:'', iconSize:[44,44], iconAnchor:[22,44] });
      L.marker([l.lat, l.lng], { icon }).addTo(mainMap).bindPopup(`
        <div class="map-popup">
          <strong>${l.title}</strong><br/>
          <span>${l.donorName}</span><br/>
          <span>${l.qty} ${l.unit} · ${timeLeft(l.expiresAt)}</span><br/>
          <span>📍 ${l.location}</span><br/>
          <button onclick="viewDetails('${l.id}')" style="margin-top:6px;padding:4px 12px;background:#2D5A27;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px">View & Claim →</button>
        </div>`, { maxWidth:220 });
    });
  }

  if (showNGOs) {
    SEED_NGOS.forEach(n => {
      const icon = L.divIcon({ html:`<div class="map-pin ngo-pin">🤝</div>`, className:'', iconSize:[40,40], iconAnchor:[20,40] });
      L.marker([n.lat, n.lng], { icon }).addTo(mainMap).bindPopup(`
        <div class="map-popup">
          <strong>${n.name}</strong><br/>
          <span>📍 ${n.address}</span><br/>
          <span>Focus: ${n.focus}</span><br/>
          <span style="color:#2D5A27;font-weight:600">✅ Verified NGO</span>
        </div>`, { maxWidth:200 });
    });
  }
}

function setMapLayer(layer, btn) {
  mainMapLayer = layer;
  document.querySelectorAll('.map-ctrl-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  refreshMapMarkers();
}

function locateMe() {
  if (!navigator.geolocation) { showToast('Geolocation not supported.', 'error'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      mainMap.setView([lat, lng], 13);
      const icon = L.divIcon({ html:`<div class="map-pin you-pin">📡</div>`, className:'', iconSize:[36,36], iconAnchor:[18,36] });
      L.marker([lat, lng], { icon }).addTo(mainMap).bindPopup('<strong>You are here</strong>').openPopup();
      showToast('📡 Location found! Showing food near you.', 'success');
    },
    () => showToast('Could not get your location.', 'error')
  );
}

// ── IMPACT STATS ─────────────────────────────────────────────
async function loadImpactStats() {
  const stats = await StatsAPI.get();
  const active = allListings.filter(l => l.status==='active').length;

  animateNum('statMeals', stats.meals);
  animateNum('statPartners', stats.donors);
  animateNum('statActive', active, false);
  if (document.getElementById('iMeals')) document.getElementById('iMeals').textContent = stats.meals.toLocaleString('en-IN') + '+';
  if (document.getElementById('iDonors')) document.getElementById('iDonors').textContent = stats.donors;
  if (document.getElementById('iNGOs')) document.getElementById('iNGOs').textContent = stats.ngos;
  if (document.getElementById('iClaimed')) document.getElementById('iClaimed').textContent = stats.claimed;
  setTimeout(() => {
    const bar = document.getElementById('iBar');
    if (bar) bar.style.width = '78%';
  }, 600);
}

function animateNum(id, target, comma=true) {
  const el = document.getElementById(id);
  if (!el) return;
  const dur = 1600, step = target / (dur/16);
  let cur = 0;
  const iv = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = comma ? Math.floor(cur).toLocaleString('en-IN') : Math.floor(cur);
    if (cur >= target) clearInterval(iv);
  }, 16);
}

function animateCounters() { /* driven by loadImpactStats */ }

// ── MODALS ───────────────────────────────────────────────────
function openModal(type) {
  let html = '';
  if (type === 'login') html = loginModal();
  else if (type === 'register') html = registerModal('donor');
  else if (type === 'register-ngo') html = registerModal('ngo');
  else if (type === 'verify-ngo') html = verifyNGOModal();
  else if (type === 'learn') html = learnModal();
  else if (type === 'dashboard') { openDashboardPanel(); return; }
  openModalWithContent(html);
}

function openModalWithContent(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── AUTH MODALS ───────────────────────────────────────────────
function loginModal() {
  return `
  <h2 class="modal-title">Welcome back</h2>
  <p class="modal-sub">Sign in to your FeedForward account</p>
  <div class="modal-form">
    <div class="form-group"><label>Email</label><input type="email" id="mEmail" placeholder="you@example.com" autocomplete="email"/></div>
    <div class="form-group"><label>Password</label><input type="password" id="mPass" placeholder="••••••••"/></div>
    <div id="loginError" class="form-error hidden"></div>
    <button class="modal-btn-primary" id="loginBtn" onclick="doLogin()">Sign In</button>
    <p class="modal-footer-text">No account? <a href="#" onclick="openModal('register')">Join FeedForward →</a></p>
    <p class="modal-footer-text" style="font-size:.78rem;color:#a07860;margin-top:.5rem">
      Demo: use any email + password "demo123"
    </p>
  </div>`;
}

async function doLogin() {
  const email = document.getElementById('mEmail').value.trim();
  const pass  = document.getElementById('mPass').value;
  const btn   = document.getElementById('loginBtn');
  const err   = document.getElementById('loginError');
  if (!email || !pass) { err.textContent='Please fill in all fields.'; err.classList.remove('hidden'); return; }
  btn.disabled = true; btn.textContent = 'Signing in…';

  // Allow demo login
  if (pass === 'demo123') {
    const users = DB.get('ff_users') || [];
    if (!users.find(u => u.email === email)) {
      await AuthAPI.register({ email, password: pass, name: email.split('@')[0], role: 'donor', city:'Delhi' });
    }
  }

  const result = await AuthAPI.login(email, pass);
  btn.disabled = false; btn.textContent = 'Sign In';
  if (result.success) {
    currentSession = result.user;
    updateNavForSession();
    closeModal();
    loadListings();
    showToast(`👋 Welcome back, ${result.user.name}!`, 'success');
  } else {
    err.textContent = result.message; err.classList.remove('hidden');
  }
}

function registerModal(defaultRole='donor') {
  return `
  <h2 class="modal-title">Join FeedForward</h2>
  <p class="modal-sub">Create your free account — takes 60 seconds</p>
  <div class="modal-form">
    <div class="form-group">
      <label>I am a</label>
      <div class="radio-group" style="margin-top:.5rem">
        <label class="radio-opt"><input type="radio" name="rrole" value="donor" ${defaultRole==='donor'?'checked':''} onchange="toggleNGOFields(this.value)"/><span>🍽️ Donor</span></label>
        <label class="radio-opt"><input type="radio" name="rrole" value="ngo" ${defaultRole==='ngo'?'checked':''} onchange="toggleNGOFields(this.value)"/><span>🤝 NGO</span></label>
      </div>
    </div>
    <div class="form-group"><label>Full Name / Org Name *</label><input type="text" id="rName" placeholder="Your name or organisation"/></div>
    <div class="form-group"><label>Email *</label><input type="email" id="rEmail" placeholder="you@example.com"/></div>
    <div class="form-group"><label>Phone *</label><input type="tel" id="rPhone" placeholder="+91 98765 43210"/></div>
    <div class="form-group"><label>City *</label><input type="text" id="rCity" placeholder="Delhi, Mumbai, Bengaluru…"/></div>
    <div class="form-group"><label>Password *</label><input type="password" id="rPass" placeholder="Min 6 characters"/></div>
    <div id="ngoFields" class="${defaultRole==='ngo'?'':'hidden'}">
      <div class="ngo-notice">
        🔒 NGO accounts require government registration verification before claiming food. You can register now and complete verification in your dashboard.
      </div>
      <div class="form-group"><label>NGO Registration No. *</label><input type="text" id="rNGOReg" placeholder="NGO2024001" style="text-transform:uppercase"/></div>
      <div class="form-group"><label>State of Registration</label><input type="text" id="rNGOState" placeholder="Delhi"/></div>
    </div>
    <div id="regError" class="form-error hidden"></div>
    <button class="modal-btn-primary" id="regBtn" onclick="doRegister()">Create Account →</button>
    <p class="modal-footer-text">Already a member? <a href="#" onclick="openModal('login')">Sign in</a></p>
  </div>`;
}

function toggleNGOFields(role) {
  const fields = document.getElementById('ngoFields');
  if (fields) { if (role === 'ngo') fields.classList.remove('hidden'); else fields.classList.add('hidden'); }
}

async function doRegister() {
  const role  = document.querySelector('input[name="rrole"]:checked')?.value || 'donor';
  const name  = document.getElementById('rName').value.trim();
  const email = document.getElementById('rEmail').value.trim();
  const phone = document.getElementById('rPhone').value.trim();
  const city  = document.getElementById('rCity').value.trim();
  const pass  = document.getElementById('rPass').value;
  const err   = document.getElementById('regError');
  const btn   = document.getElementById('regBtn');
  if (!name||!email||!city||!pass) { err.textContent='Please fill in all required fields.'; err.classList.remove('hidden'); return; }
  if (pass.length < 6) { err.textContent='Password must be at least 6 characters.'; err.classList.remove('hidden'); return; }
  btn.disabled = true; btn.textContent = 'Creating account…';
  const extra = role === 'ngo' ? { ngoRegNumber: document.getElementById('rNGOReg')?.value||'', ngoState: document.getElementById('rNGOState')?.value||'' } : {};
  const result = await AuthAPI.register({ name, email, password: pass, phone, city, role, ...extra });
  btn.disabled = false; btn.textContent = 'Create Account →';
  if (result.success) {
    currentSession = result.user;
    updateNavForSession();
    closeModal();
    loadListings();
    if (role === 'ngo') {
      showToast('🎉 Registered! Complete NGO verification in your dashboard.', 'success');
      setTimeout(() => openDashboardPanel(), 1200);
    } else {
      showToast(`🎉 Welcome to FeedForward, ${name}!`, 'success');
    }
  } else {
    err.textContent = result.message; err.classList.remove('hidden');
  }
}

// ── NGO VERIFICATION MODAL ────────────────────────────────────
function verifyNGOModal() {
  return `
  <h2 class="modal-title">NGO Verification</h2>
  <p class="modal-sub">We verify your NGO credentials against government registry to ensure food safety and accountability.</p>
  <div class="modal-form">
    <div class="verify-steps">
      <div class="vstep active" id="vstep1">
        <div class="vstep-header"><span class="vstep-num">1</span><strong>Registration Check</strong></div>
        <div class="vstep-body">
          <div class="form-group">
            <label>NGO Registration Number *</label>
            <input type="text" id="vNGOReg" placeholder="e.g. NGO2024001" style="text-transform:uppercase"
              oninput="this.value=this.value.toUpperCase()"/>
            <p class="field-hint">Try: NGO2024001, NGO2024002, NGO2024003, NGO2024004</p>
          </div>
          <div class="form-group">
            <label>Organisation Name (as registered) *</label>
            <input type="text" id="vNGOName" placeholder="Official registered name"/>
          </div>
          <div id="vStep1Result" class="verify-result hidden"></div>
          <button class="modal-btn-primary" id="vStep1Btn" onclick="runVerificationStep1()">Verify Registration →</button>
        </div>
      </div>
      <div class="vstep" id="vstep2">
        <div class="vstep-header"><span class="vstep-num">2</span><strong>Document Verification</strong></div>
        <div class="vstep-body">
          <div class="form-group">
            <label>Document Type</label>
            <select id="vDocType">
              <option value="pan">PAN Card</option>
              <option value="fcra">FCRA Registration</option>
              <option value="gstin">GSTIN (if applicable)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Document Number *</label>
            <input type="text" id="vDocNum" placeholder="Enter document number" style="text-transform:uppercase"
              oninput="this.value=this.value.toUpperCase()"/>
            <p class="field-hint">PAN format: AAAAA0000A · FCRA: any 6+ digit number</p>
          </div>
          <div id="vStep2Result" class="verify-result hidden"></div>
          <button class="modal-btn-primary" id="vStep2Btn" onclick="runVerificationStep2()">Verify Document →</button>
        </div>
      </div>
      <div class="vstep" id="vstep3">
        <div class="vstep-header"><span class="vstep-num">3</span><strong>Upload ID Proof</strong></div>
        <div class="vstep-body">
          <div class="upload-zone" id="uploadZone" onclick="document.getElementById('docUpload').click()">
            <div class="upload-icon">📄</div>
            <p>Click to upload NGO registration certificate</p>
            <p style="font-size:.78rem;color:#a07860">PDF, JPG, PNG — max 5MB</p>
            <input type="file" id="docUpload" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="handleDocUpload(this)"/>
          </div>
          <div id="uploadStatus" class="hidden"></div>
          <div id="vStep3Result" class="verify-result hidden"></div>
          <button class="modal-btn-primary hidden" id="vFinalBtn" onclick="completeVerification()">Complete Verification →</button>
        </div>
      </div>
    </div>
  </div>`;
}

let verifyState = { step1:false, step2:false, step3:false, ngoDetails:null };

async function runVerificationStep1() {
  const reg  = document.getElementById('vNGOReg').value.trim();
  const name = document.getElementById('vNGOName').value.trim();
  if (!reg||!name) { setVerifyResult('vStep1Result','error','Please fill in both fields.'); return; }
  const btn = document.getElementById('vStep1Btn');
  btn.disabled = true; btn.textContent = '🔍 Checking registry…';
  setVerifyResult('vStep1Result','loading','Checking government NGO registry…');
  const result = await VerificationAPI.verifyNGO(reg, name);
  btn.disabled = false; btn.textContent = 'Verify Registration →';
  if (result.success) {
    setVerifyResult('vStep1Result','success', result.message);
    verifyState.step1 = true;
    verifyState.ngoDetails = result.details;
    setTimeout(() => { document.getElementById('vstep1').classList.add('done'); document.getElementById('vstep2').classList.add('active'); }, 600);
  } else {
    setVerifyResult('vStep1Result','error', result.message);
  }
}

async function runVerificationStep2() {
  if (!verifyState.step1) { showToast('Complete Step 1 first.','error'); return; }
  const docType = document.getElementById('vDocType').value;
  const docNum  = document.getElementById('vDocNum').value.trim();
  if (!docNum) { setVerifyResult('vStep2Result','error','Please enter the document number.'); return; }
  const btn = document.getElementById('vStep2Btn');
  btn.disabled = true; btn.textContent = '🔍 Verifying…';
  setVerifyResult('vStep2Result','loading','Verifying document…');
  const result = await VerificationAPI.verifyDocument(docType, docNum);
  btn.disabled = false; btn.textContent = 'Verify Document →';
  if (result.success) {
    setVerifyResult('vStep2Result','success', result.message);
    verifyState.step2 = true;
    setTimeout(() => { document.getElementById('vstep2').classList.add('done'); document.getElementById('vstep3').classList.add('active'); }, 600);
  } else {
    setVerifyResult('vStep2Result','error', result.message);
  }
}

function handleDocUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('uploadStatus');
  status.className = 'upload-progress';
  status.innerHTML = `<div class="progress-bar"><div class="progress-fill" id="pFill"></div></div><span id="pText">Uploading ${file.name}…</span>`;
  status.classList.remove('hidden');
  let w = 0;
  const iv = setInterval(() => {
    w = Math.min(w + Math.random()*15, 100);
    const fill = document.getElementById('pFill');
    const text = document.getElementById('pText');
    if (fill) fill.style.width = w + '%';
    if (text && w >= 100) { text.textContent = `✅ ${file.name} uploaded successfully`; clearInterval(iv); }
  }, 120);
  setTimeout(() => {
    verifyState.step3 = true;
    setVerifyResult('vStep3Result','success','Document uploaded and queued for manual review.');
    document.getElementById('vFinalBtn').classList.remove('hidden');
  }, 2500);
}

async function completeVerification() {
  if (!verifyState.step1||!verifyState.step2||!verifyState.step3) {
    showToast('Please complete all verification steps.','error'); return;
  }
  const btn = document.getElementById('vFinalBtn');
  btn.disabled = true; btn.textContent = 'Processing…';
  await delay(1000);
  if (currentSession) {
    AuthAPI.updateVerification(currentSession.userId, 'verified', verifyState.ngoDetails);
    currentSession.verificationStatus = 'verified';
    updateNavForSession();
  }
  closeModal();
  loadListings();
  showToast('🎉 NGO Verified! You can now claim food listings.', 'success');
}

function setVerifyResult(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  const icons = { success:'✅', error:'❌', loading:'⏳', info:'ℹ️' };
  el.className = `verify-result verify-${type}`;
  el.innerHTML = `${icons[type]||''} ${msg}`;
  el.classList.remove('hidden');
}

// ── LEARN MODAL ───────────────────────────────────────────────
function learnModal() {
  return `
  <div>
    <div style="font-size:2.5rem;margin-bottom:1rem">🤝</div>
    <h2 class="modal-title">NGO Membership</h2>
    <p class="modal-sub">Everything NGOs need to know about joining FeedForward</p>
    <div style="display:flex;flex-direction:column;gap:.75rem;margin-bottom:1.5rem">
      ${[
        ['✅ Free forever','No subscription fees, no hidden costs.'],
        ['🔒 Background-verified','We verify every NGO using government registries.'],
        ['📲 Instant alerts','SMS + app notifications the moment food is posted near you.'],
        ['📋 Easy compliance','Food safety documentation templates included.'],
        ['🗺️ Live map view','See all available food on a real-time map.'],
        ['🤝 Direct contact','Coordinate pickup directly with the donor.'],
      ].map(([t,d])=>`<div style="display:flex;gap:1rem;padding:.875rem;background:#F9F6F0;border-radius:10px"><span>${t.slice(0,2)}</span><div><strong style="display:block;font-size:.875rem;margin-bottom:2px">${t.slice(2).trim()}</strong><span style="font-size:.82rem;color:#6B4C3B">${d}</span></div></div>`).join('')}
    </div>
    <button class="modal-btn-primary" onclick="openModal('register-ngo')">Register Your NGO →</button>
  </div>`;
}

// ── DASHBOARD PANEL ───────────────────────────────────────────
function openDashboardPanel() {
  const session = AuthAPI.getSession();
  if (!session) { openModal('login'); return; }
  const panel = document.getElementById('panelOverlay');
  document.getElementById('panelTitle').textContent = session.role === 'ngo' ? '🤝 NGO Dashboard' : '🍽️ Donor Dashboard';
  renderDashboardContent(session);
  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDashboardPanel() {
  document.getElementById('panelOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function renderDashboardContent(session) {
  const { posted, claimed } = ListingsAPI.getForUser(session.userId);
  const vstatus = session.verificationStatus;
  const vBadge = vstatus==='verified'
    ? `<div class="dash-status verified">✅ Verified & Active</div>`
    : `<div class="dash-status pending">⏳ Verification Pending <button onclick="closeDashboardPanel();setTimeout(()=>openModal('verify-ngo'),200)" class="verify-now-btn">Verify Now →</button></div>`;

  let html = `
    <div class="dash-profile">
      <div class="dash-avatar">${session.name.slice(0,2).toUpperCase()}</div>
      <div>
        <strong>${session.name}</strong>
        <span>${session.email}</span>
        <span style="font-size:.75rem;color:#a07860;text-transform:capitalize">${session.role}</span>
      </div>
    </div>
    ${session.role==='ngo' ? vBadge : ''}
    <div class="dash-stats">
      ${session.role==='ngo'
        ? `<div class="dash-stat"><span>${claimed.length}</span><span>Claimed</span></div>`
        : `<div class="dash-stat"><span>${posted.length}</span><span>Posted</span></div>`}
    </div>`;

  if (session.role === 'ngo') {
    html += `<h4 class="dash-section-title">Recently Claimed</h4>`;
    html += claimed.length
      ? claimed.slice(0,5).map(l=>`<div class="dash-listing-item">${l.emoji||'🍽️'} <div><strong>${l.title}</strong><span>${l.donorName} · ${l.qty} ${l.unit}</span></div></div>`).join('')
      : `<p class="dash-empty">${vstatus!=='verified'?'Complete verification to start claiming food.':'No claims yet. Browse listings to get started.'}</p>`;
  } else {
    html += `<h4 class="dash-section-title">Your Listings</h4>`;
    html += posted.length
      ? posted.slice(0,5).map(l=>`<div class="dash-listing-item">${l.emoji||'🍽️'} <div><strong>${l.title}</strong><span>${l.qty} ${l.unit} · <span class="status-dot ${l.status}">${l.status}</span></span></div></div>`).join('')
      : `<p class="dash-empty">No listings yet. Post your first surplus food!</p>`;
    html += `<button class="btn-primary" style="width:100%;margin-top:1rem" onclick="closeDashboardPanel();scrollToPost()">Post Surplus Food →</button>`;
  }
  document.getElementById('panelContent').innerHTML = html;
}

// ── MISC HELPERS ──────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.className='toast'; }, 3800);
}

function toggleMobileMenu() { document.getElementById('mobileMenu').classList.toggle('open'); }

function initScrollReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.style.opacity='1'; e.target.style.transform='translateY(0)'; }
    });
  }, { threshold:0.1 });
  ['.step-card','.impact-card','.post-feat'].forEach(sel => {
    document.querySelectorAll(sel).forEach((el,i) => {
      el.style.opacity='0'; el.style.transform='translateY(20px)';
      el.style.transition=`opacity 0.5s ease ${i*0.1}s, transform 0.5s ease ${i*0.1}s`;
      obs.observe(el);
    });
  });
}

document.addEventListener('keydown', e => { if (e.key==='Escape') { closeModal(); closeDashboardPanel(); } });
document.querySelectorAll?.('.mobile-menu a')?.forEach(a => a.addEventListener('click', ()=>document.getElementById('mobileMenu').classList.remove('open')));