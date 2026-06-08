const DB_KEYS = {
  users: 'ff_users',
  listings: 'ff_listings',
  sessions: 'ff_session',
  claims: 'ff_claims',
  stats: 'ff_stats'
};

// ── UTILITIES ──────────────────────────────────────────────
const DB = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch(e){ return null; } },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  update: (key, fn) => { const cur = DB.get(key); DB.set(key, fn(cur)); },
};

const genId = () => '_' + Math.random().toString(36).substr(2,9);
const delay = (ms=300) => new Promise(r => setTimeout(r, ms));

// ── SEED DATA ──────────────────────────────────────────────
const SEED_LISTINGS = [
  { id:'l001', emoji:'🍛', title:'Dal Makhani & Naan', donorName:'Spice Garden Restaurant', type:'restaurant', qty:40, unit:'portions', diet:'veg', location:'Connaught Place, New Delhi', lat:28.6315, lng:77.2167, expiresAt: futureTime(3), urgency:80, status:'active', donorPhone:'+91 98110 11111', notes:'Freshly prepared, no nuts', postedAt: Date.now()-1800000 },
  { id:'l002', emoji:'🎂', title:'Wedding Desserts Assortment', donorName:'Grand Ballroom Events', type:'event', qty:120, unit:'pieces', diet:'veg', location:'Dwarka Sector 10, Delhi', lat:28.5921, lng:77.0460, expiresAt: futureTime(5), urgency:60, status:'active', donorPhone:'+91 98110 22222', notes:'Assorted mithai and pastries', postedAt: Date.now()-3600000 },
  { id:'l003', emoji:'🥗', title:'Salad Bar & Artisan Breads', donorName:'The Farm Table Café', type:'restaurant', qty:25, unit:'portions', diet:'vegan', location:'Hauz Khas Village, Delhi', lat:28.5494, lng:77.2001, expiresAt: futureTime(1), urgency:95, status:'claimed', donorPhone:'+91 98110 33333', notes:'Gluten-free options available', postedAt: Date.now()-7200000 },
  { id:'l004', emoji:'🍗', title:'Chicken Biryani (Bulk)', donorName:'Zaiqa Catering Services', type:'catering', qty:80, unit:'portions', diet:'halal', location:'Lajpat Nagar, New Delhi', lat:28.5677, lng:77.2433, expiresAt: futureTime(6), urgency:45, status:'active', donorPhone:'+91 98110 44444', notes:'Halal certified, containers available', postedAt: Date.now()-900000 },
  { id:'l005', emoji:'🥐', title:'Fresh Croissants & Muffins', donorName:'Sunrise Patisserie', type:'bakery', qty:60, unit:'items', diet:'veg', location:'Vasant Vihar, New Delhi', lat:28.5744, lng:77.1673, expiresAt: futureTime(0.5), urgency:98, status:'active', donorPhone:'+91 98110 55555', notes:'Best consumed within 4 hours', postedAt: Date.now()-600000 },
  { id:'l006', emoji:'🍱', title:'Corporate Lunch Box Sets', donorName:'Tiffin Express Catering', type:'catering', qty:50, unit:'boxes', diet:'veg', location:'Cyber City, Gurugram', lat:28.4949, lng:77.0888, expiresAt: futureTime(2), urgency:85, status:'active', donorPhone:'+91 98110 66666', notes:'Balanced meals, sealed packaging', postedAt: Date.now()-300000 },
  { id:'l007', emoji:'🫕', title:'Paneer Makhani + Jeera Rice', donorName:'Punjabi Tadka Restaurant', type:'restaurant', qty:35, unit:'portions', diet:'veg', location:'Rohini Sector 9, Delhi', lat:28.7041, lng:77.1025, expiresAt: futureTime(8), urgency:30, status:'active', donorPhone:'+91 98110 77777', notes:'No onion/garlic available', postedAt: Date.now()-5400000 },
  { id:'l008', emoji:'🍰', title:'Birthday Cake Slices & Pastries', donorName:'Celebrations Banquet', type:'event', qty:90, unit:'pieces', diet:'veg', location:'Noida Sector 62', lat:28.6271, lng:77.3648, expiresAt: futureTime(4), urgency:55, status:'active', donorPhone:'+91 98110 88888', notes:'', postedAt: Date.now()-2700000 },
  { id:'l009', emoji:'🥩', title:'Mutton Seekh Kebabs', donorName:'Mughal Kitchen', type:'restaurant', qty:45, unit:'portions', diet:'nonveg', location:'Old Delhi, Chandni Chowk', lat:28.6562, lng:77.2312, expiresAt: futureTime(3.5), urgency:70, status:'active', donorPhone:'+91 98110 99999', notes:'Freshly grilled this evening', postedAt: Date.now()-1200000 },
];

const SEED_NGOS = [
  { id:'n001', name:'Asha Foundation', lat:28.6139, lng:77.2090, address:'Civil Lines, Delhi', verified:true, focus:'Children & Women' },
  { id:'n002', name:'Roti Bank Delhi', lat:28.6448, lng:77.2167, address:'Kashmere Gate, Delhi', verified:true, focus:'Daily meals' },
  { id:'n003', name:'Feeding India', lat:28.5355, lng:77.3910, address:'Sector 44, Noida', verified:true, focus:'Food rescue' },
  { id:'n004', name:'Hunger Free India', lat:28.4595, lng:77.0266, address:'MG Road, Gurugram', verified:true, focus:'Urban homeless' },
  { id:'n005', name:'Anna Daan Trust', lat:28.6986, lng:77.1377, address:'Model Town, Delhi', verified:true, focus:'Elderly care' },
];

function futureTime(hours) {
  return new Date(Date.now() + hours * 3600000).toISOString();
}

function seedDatabase() {
  if (!DB.get(DB_KEYS.listings)) {
    DB.set(DB_KEYS.listings, SEED_LISTINGS);
  }
  if (!DB.get(DB_KEYS.users)) {
    DB.set(DB_KEYS.users, []);
  }
  if (!DB.get(DB_KEYS.claims)) {
    DB.set(DB_KEYS.claims, []);
  }
}

// ── NGO VERIFICATION ENGINE ─────────────────────────────────
const NGO_REGISTRY = {
  'NGO2024001': { name: 'Asha Foundation', state: 'Delhi', type: 'Section 8', valid: true },
  'NGO2024002': { name: 'Roti Bank Delhi', state: 'Delhi', type: 'Trust', valid: true },
  'NGO2024003': { name: 'Hunger Free India', state: 'Haryana', type: 'Society', valid: true },
  'NGO2024004': { name: 'Feeding India Trust', state: 'Uttar Pradesh', type: 'Section 8', valid: true },
  'NGO2024999': { name: 'Test NGO', state: 'Delhi', type: 'Society', valid: true },
  'FAKE001': { name: 'Invalid Org', state: 'Unknown', type: 'Unknown', valid: false },
};

const VerificationAPI = {
  verifyNGO: async (regNumber, orgName) => {
    await delay(2000); // simulate network call
    const record = NGO_REGISTRY[regNumber.toUpperCase()];
    if (!record) {
      return { success: false, status: 'NOT_FOUND', message: 'Registration number not found in government registry.' };
    }
    if (!record.valid) {
      return { success: false, status: 'INVALID', message: 'This registration has been flagged as invalid.' };
    }
    const nameMatch = orgName.toLowerCase().split(' ').some(w =>
      w.length > 3 && record.name.toLowerCase().includes(w)
    );
    if (!nameMatch) {
      return {
        success: false, status: 'NAME_MISMATCH',
        message: `Organisation name does not match registry. Found: "${record.name}"`
      };
    }
    return {
      success: true, status: 'VERIFIED',
      message: `✅ Verified! "${record.name}" is a registered ${record.type} in ${record.state}.`,
      details: record
    };
  },

  verifyDocument: async (docType, docNumber) => {
    await delay(1500);
    const patterns = {
      pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
      cin: /^[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/,
      gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    };
    if (docType === 'fcra') {
      const valid = docNumber.length >= 6;
      return { success: valid, message: valid ? '✅ FCRA number format valid' : '❌ Invalid FCRA number format' };
    }
    const pat = patterns[docType];
    if (!pat) return { success: true, message: '✅ Document accepted' };
    const valid = pat.test(docNumber.toUpperCase());
    return { success: valid, message: valid ? `✅ ${docType.toUpperCase()} number verified` : `❌ ${docType.toUpperCase()} format invalid` };
  }
};

// ── GEOCODING API (OpenStreetMap Nominatim — free, no key) ──
const GeoAPI = {
  geocode: async (address) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', India')}&limit=5&addressdetails=1`;
    try {
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      return data.map(d => ({
        display_name: d.display_name.replace(', India', '').split(',').slice(0,3).join(','),
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon)
      }));
    } catch(e) {
      // Fallback: return Delhi center if geocoding fails
      return [{ display_name: address, lat: 28.6139, lng: 77.2090 }];
    }
  },

  reverseGeocode: async (lat, lng) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      return data.display_name?.split(',').slice(0,3).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch(e) {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }
};

// ── USER AUTH API ───────────────────────────────────────────
const AuthAPI = {
  register: async (userData) => {
    await delay(800);
    const users = DB.get(DB_KEYS.users) || [];
    if (users.find(u => u.email === userData.email)) {
      return { success: false, message: 'Email already registered.' };
    }
    const user = {
      id: genId(),
      ...userData,
      password: btoa(userData.password), // simple obfuscation
      createdAt: new Date().toISOString(),
      verified: userData.role === 'donor', // donors auto-verified; NGOs need doc check
      verificationStatus: userData.role === 'ngo' ? 'pending' : 'verified',
      listings: [],
      claims: []
    };
    users.push(user);
    DB.set(DB_KEYS.users, users);
    const session = { userId: user.id, role: user.role, name: user.name, email: user.email, verificationStatus: user.verificationStatus };
    DB.set(DB_KEYS.sessions, session);
    return { success: true, user: session };
  },

  login: async (email, password) => {
    await delay(600);
    const users = DB.get(DB_KEYS.users) || [];
    const user = users.find(u => u.email === email && u.password === btoa(password));
    if (!user) return { success: false, message: 'Invalid email or password.' };
    const session = { userId: user.id, role: user.role, name: user.name, email: user.email, verificationStatus: user.verificationStatus };
    DB.set(DB_KEYS.sessions, session);
    return { success: true, user: session };
  },

  logout: () => { localStorage.removeItem(DB_KEYS.sessions); },

  getSession: () => DB.get(DB_KEYS.sessions),

  updateVerification: (userId, status, ngoDetails) => {
    DB.update(DB_KEYS.users, users =>
      users.map(u => u.id === userId ? { ...u, verificationStatus: status, ngoDetails, verified: status === 'verified' } : u)
    );
    const session = DB.get(DB_KEYS.sessions);
    if (session && session.userId === userId) {
      session.verificationStatus = status;
      DB.set(DB_KEYS.sessions, session);
    }
  }
};

// ── LISTINGS API ─────────────────────────────────────────────
const ListingsAPI = {
  getAll: async () => {
    await delay(200);
    return DB.get(DB_KEYS.listings) || [];
  },

  getActive: async () => {
    const listings = DB.get(DB_KEYS.listings) || [];
    return listings.filter(l => l.status === 'active' && new Date(l.expiresAt) > new Date());
  },

  create: async (listingData) => {
    await delay(500);
    const listing = {
      id: genId(),
      ...listingData,
      status: 'active',
      postedAt: new Date().toISOString(),
      urgency: calcUrgency(listingData.expiresAt),
      claimedBy: null
    };
    DB.update(DB_KEYS.listings, l => [listing, ...(l || [])]);

    // Attach to user
    const session = AuthAPI.getSession();
    if (session) {
      DB.update(DB_KEYS.users, users =>
        users.map(u => u.id === session.userId ? { ...u, listings: [listing.id, ...(u.listings||[])] } : u)
      );
    }
    updateStats();
    return { success: true, listing };
  },

  claim: async (listingId) => {
    await delay(400);
    const session = AuthAPI.getSession();
    if (!session) return { success: false, message: 'Please sign in to claim food.' };
    if (session.role !== 'ngo') return { success: false, message: 'Only NGOs can claim food listings.' };
    if (session.verificationStatus !== 'verified') return { success: false, message: 'Your NGO verification is pending. Please complete verification to claim food.' };

    const listings = DB.get(DB_KEYS.listings) || [];
    const listing = listings.find(l => l.id === listingId);
    if (!listing) return { success: false, message: 'Listing not found.' };
    if (listing.status !== 'active') return { success: false, message: 'This listing has already been claimed.' };

    DB.update(DB_KEYS.listings, ls =>
      ls.map(l => l.id === listingId ? { ...l, status: 'claimed', claimedBy: session.userId, claimedAt: new Date().toISOString() } : l)
    );

    // Record claim
    const claims = DB.get(DB_KEYS.claims) || [];
    claims.push({ id: genId(), listingId, ngoId: session.userId, ngoName: session.name, claimedAt: new Date().toISOString() });
    DB.set(DB_KEYS.claims, claims);

    // Attach to user
    DB.update(DB_KEYS.users, users =>
      users.map(u => u.id === session.userId ? { ...u, claims: [listingId, ...(u.claims||[])] } : u)
    );
    updateStats();
    return { success: true };
  },

  getForUser: (userId) => {
    const listings = DB.get(DB_KEYS.listings) || [];
    const users = DB.get(DB_KEYS.users) || [];
    const user = users.find(u => u.id === userId);
    if (!user) return { posted: [], claimed: [] };
    return {
      posted: listings.filter(l => user.listings?.includes(l.id)),
      claimed: listings.filter(l => user.claims?.includes(l.id))
    };
  }
};

// ── STATS API ────────────────────────────────────────────────
function calcUrgency(expiresAt) {
  const diff = (new Date(expiresAt) - Date.now()) / 3600000;
  if (diff <= 0.5) return 100;
  if (diff <= 1) return 90;
  if (diff <= 2) return 75;
  if (diff <= 4) return 55;
  if (diff <= 8) return 35;
  return 20;
}

function updateStats() {
  const listings = DB.get(DB_KEYS.listings) || [];
  const users = DB.get(DB_KEYS.users) || [];
  const claimed = listings.filter(l => l.status === 'claimed');
  const totalMeals = claimed.reduce((acc, l) => acc + (parseInt(l.qty)||0), 0) + 12000;
  const donors = users.filter(u => u.role !== 'ngo').length;
  const ngos = users.filter(u => u.role === 'ngo' && u.verified).length;
  const stats = { meals: totalMeals, donors: donors + 180, ngos: ngos + 140, claimed: claimed.length + 980 };
  DB.set(DB_KEYS.stats, stats);
  return stats;
}

const StatsAPI = {
  get: async () => {
    await delay(100);
    return DB.get(DB_KEYS.stats) || updateStats();
  }
};

// Expose globals
window.DB = DB;
window.AuthAPI = AuthAPI;
window.ListingsAPI = ListingsAPI;
window.GeoAPI = GeoAPI;
window.VerificationAPI = VerificationAPI;
window.StatsAPI = StatsAPI;
window.SEED_NGOS = SEED_NGOS;
window.genId = genId;

// Seed on load
seedDatabase();
updateStats();
console.log('🌿 FeedForward backend ready. DB keys:', Object.keys(DB_KEYS).join(', '));