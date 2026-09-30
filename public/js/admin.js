// ==========================================
//   AutoReview — Admin Page Logic
// ==========================================

let BASE_URL = window.location.origin;

// --- DOM Elements ---
const loginCard = document.getElementById('login-card');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const adminPasswordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const storageBadge = document.getElementById('storage-badge');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const restoreFileInput = document.getElementById('restore-file-input');
const dashboardContent = document.getElementById('dashboard-content');

const shopForm = document.getElementById('shop-form');
const saveBtn = document.getElementById('save-btn');
const qrCard = document.getElementById('qr-card');
const qrContainer = document.getElementById('qr-container');
const reviewUrlEl = document.getElementById('review-url');
const copyLinkBtn = document.getElementById('copy-link-btn');
const downloadQrBtn = document.getElementById('download-qr-btn');
const printQrBtn = document.getElementById('print-qr-btn');
const shopList = document.getElementById('shop-list');
const noShops = document.getElementById('no-shops');
const toast = document.getElementById('toast');
const mapsUrlInput = document.getElementById('google-maps-url');
const placeIdInput = document.getElementById('place-id');
const shopNameInput = document.getElementById('shop-name');
const testLinkBtn = document.getElementById('test-link-btn');
const linkStatus = document.getElementById('link-status');
const phoneBanner = document.getElementById('phone-banner');
const phoneLink = document.getElementById('phone-link');

let currentShopId = null;

// --- Token Management ---
const TOKEN_KEY = 'autoreview_admin_token';
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// --- Authenticated Fetch Helper ---
async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token || ''}`,
  };

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
    showLogin();
    showToast('⚠️ Session expired. Please log in again.');
    throw new Error('Unauthorized');
  }
  return res;
}

// --- View Toggles ---
function showLogin() {
  loginCard.style.display = 'block';
  dashboardContent.style.display = 'none';
  logoutBtn.style.display = 'none';
  if (exportBtn) exportBtn.style.display = 'none';
  if (importBtn) importBtn.style.display = 'none';
  if (storageBadge) storageBadge.style.display = 'none';
  adminPasswordInput.value = '';
  loginError.style.display = 'none';
}

function showDashboard() {
  loginCard.style.display = 'none';
  dashboardContent.style.display = 'block';
  logoutBtn.style.display = 'inline-block';
  if (exportBtn) exportBtn.style.display = 'inline-block';
  if (importBtn) importBtn.style.display = 'inline-block';
  updateStorageBadge();
}

async function updateStorageBadge() {
  if (!storageBadge) return;
  try {
    const res = await authFetch('/api/admin/status');
    if (res.ok) {
      const data = await res.json();
      storageBadge.style.display = 'inline-block';
      if (data.storageMode === 'mongodb') {
        storageBadge.innerHTML = '☁️ <strong>Cloud DB:</strong> MongoDB Atlas (Permanent)';
        storageBadge.style.background = '#dcfce7';
        storageBadge.style.color = '#15803d';
        storageBadge.style.borderColor = '#86efac';
      } else {
        storageBadge.innerHTML = '📁 <strong>Storage:</strong> Local JSON';
        storageBadge.style.background = '#f1f5f9';
        storageBadge.style.color = '#475569';
        storageBadge.style.borderColor = '#cbd5e1';
      }
    }
  } catch (_) {}
}

// --- Backup & Restore Handlers ---
if (exportBtn) {
  exportBtn.addEventListener('click', async () => {
    try {
      showToast('Preparing backup...');
      const res = await authFetch('/api/admin/export');
      if (!res.ok) throw new Error('Failed to export backup');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `autoreview-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('✅ Backup downloaded successfully!');
    } catch (err) {
      showToast('❌ Export failed: ' + err.message);
    }
  });
}

if (importBtn && restoreFileInput) {
  importBtn.addEventListener('click', () => {
    restoreFileInput.value = '';
    restoreFileInput.click();
  });

  restoreFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm(`Restore shops from "${file.name}"? This will update the shop database.`)) {
      return;
    }

    try {
      showToast('Restoring backup...');
      const text = await file.text();
      const parsed = JSON.parse(text);
      const shopsArray = Array.isArray(parsed) ? parsed : (parsed.shops || null);

      if (!Array.isArray(shopsArray)) {
        throw new Error('File does not contain a valid array of shops');
      }

      const res = await authFetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shops: shopsArray }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      showToast(`✅ Successfully restored ${data.count} shop(s)!`);
      await loadShops();
      await updateStorageBadge();
    } catch (err) {
      showToast('❌ Restore failed: ' + err.message);
    }
  });
}

// --- Login Form Handler ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = adminPasswordInput.value.trim();
  if (!password) return;

  loginBtn.disabled = true;
  loginBtn.textContent = 'Verifying...';
  loginError.style.display = 'none';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Incorrect password');
    }

    setToken(data.token);
    showDashboard();
    loadShops();
    showToast('✅ Logged in successfully');
  } catch (err) {
    loginError.textContent = err.message;
    loginError.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = '🔐 Log In';
  }
});

// --- Logout Button Handler ---
logoutBtn.addEventListener('click', async () => {
  try {
    await authFetch('/api/admin/logout', { method: 'POST' });
  } catch {}
  setToken(null);
  showLogin();
  showToast('🚪 Logged out');
});

// --- Initialize ---
document.addEventListener('DOMContentLoaded', async () => {
  await initNetworkInfo();

  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }

  try {
    const res = await fetch('/api/admin/check', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) {
      showDashboard();
      loadShops();
    } else {
      setToken(null);
      showLogin();
    }
  } catch {
    showLogin();
  }
});

async function initNetworkInfo() {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  // In production, we don't need the local Wi-Fi test banner or IP overrides
  if (!isLocal) {
    return;
  }

  try {
    const res = await fetch('/api/network-info');
    const data = await res.json();
    if (data.networkUrl) {
      if (phoneBanner && phoneLink) {
        phoneLink.textContent = data.networkUrl;
        phoneBanner.style.display = 'block';
      }
      BASE_URL = data.networkUrl;
      console.log(`📱 QR codes configured for mobile testing: ${BASE_URL}`);
    }
  } catch (err) {
    console.warn('Network info unavailable:', err);
  }
}

// --- Test Link Button ---
testLinkBtn.addEventListener('click', () => {
  const placeId = placeIdInput.value.trim();
  const mapsUrl = mapsUrlInput.value.trim();

  let targetUrl = '';
  if (placeId && placeId.startsWith('ChIJ')) {
    targetUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;
  } else if (mapsUrl) {
    targetUrl = mapsUrl;
  }

  if (!targetUrl) {
    showToast('⚠️ Please enter a Google Maps or Review link first');
    return;
  }

  window.open(targetUrl, '_blank');
});

// --- Auto-lookup Place ID & Info when Maps URL is pasted ---
mapsUrlInput.addEventListener('input', debounce(async () => {
  const url = mapsUrlInput.value.trim();
  if (!url) {
    linkStatus.style.display = 'none';
    return;
  }

  await inspectMapsUrl(url);
}, 800));

async function inspectMapsUrl(url) {
  try {
    linkStatus.style.display = 'block';
    linkStatus.innerHTML = '<span style="color: var(--text-light);">🔍 Checking link...</span>';

    const res = await authFetch('/api/lookup-placeid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    // Auto-fill shop name if empty
    if (data.placeName && !shopNameInput.value.trim()) {
      shopNameInput.value = data.placeName;
      showToast(`✨ Shop name auto-detected: "${data.placeName}"`);
    }

    if (data.placeId) {
      placeIdInput.value = data.placeId;
      linkStatus.innerHTML = '<span style="color: var(--accent); font-weight: 500;">⭐ Direct review popup active! (0 clicks required)</span>';
      showToast('✅ Place ID found! Review popup will open directly.');
    } else if (data.isDirectReview) {
      linkStatus.innerHTML = '<span style="color: var(--accent); font-weight: 500;">⭐ Direct Google review link detected! (Opens popup directly)</span>';
    } else {
      linkStatus.innerHTML = '<span style="color: #2563eb;">📍 Google Maps location verified (Opens shop page, customer taps "Reviews"). To open review popup directly with 0 clicks, enter Place ID below.</span>';
    }
  } catch (err) {
    linkStatus.style.display = 'none';
    console.error('URL inspection failed:', err);
  }
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// --- Form Submit ---
shopForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const shopData = {
    id: currentShopId || undefined,
    name: document.getElementById('shop-name').value.trim(),
    placeId: document.getElementById('place-id').value.trim(),
    googleMapsUrl: document.getElementById('google-maps-url').value.trim(),
    category: document.getElementById('category').value,
    language: document.getElementById('language').value,
    description: document.getElementById('description').value.trim(),
  };

  if (!shopData.name) {
    showToast('❌ Please enter a shop name');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="loading-text"><span class="spinner"></span> Saving...</span>';

  try {
    const res = await authFetch('/api/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shopData),
    });

    if (!res.ok) throw new Error('Failed to save');

    const shop = await res.json();
    currentShopId = shop.id;

    generateQRCode(shop.id);
    loadShops();
    showToast('✅ Shop saved! QR code generated.');

    // Scroll to QR code
    setTimeout(() => {
      qrCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);

  } catch (err) {
    showToast('❌ Error saving shop. Try again.');
    console.error(err);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '💾 Save & Generate QR Code';
  }
});

// --- Generate QR Code ---
function generateQRCode(shopId) {
  const reviewUrl = `${BASE_URL}/review?shop=${shopId}`;
  reviewUrlEl.textContent = reviewUrl;

  // Clear previous
  qrContainer.innerHTML = '';

  // Generate QR using qrcodejs library
  new QRCode(qrContainer, {
    text: reviewUrl,
    width: 250,
    height: 250,
    colorDark: '#1f2937',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });

  qrCard.classList.remove('hidden');
}

// --- Copy Link ---
copyLinkBtn.addEventListener('click', () => {
  const url = reviewUrlEl.textContent;
  navigator.clipboard.writeText(url).then(() => {
    showToast('📋 Link copied!');
  }).catch(() => {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('📋 Link copied!');
  });
});

// --- Download QR ---
downloadQrBtn.addEventListener('click', () => {
  const canvas = qrContainer.querySelector('canvas');
  const img = qrContainer.querySelector('img');
  const src = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
  if (!src) return;

  const link = document.createElement('a');
  link.download = `autoreview-qr-${currentShopId || 'code'}.png`;
  link.href = src;
  link.click();
  showToast('⬇️ QR code downloaded!');
});

// --- Print QR ---
printQrBtn.addEventListener('click', () => {
  const canvas = qrContainer.querySelector('canvas');
  const img = qrContainer.querySelector('img');
  const imgData = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
  if (!imgData) return;

  const shopName = document.getElementById('shop-name').value || 'Our Shop';

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
    <head><title>Print QR Code</title></head>
    <body style="text-align: center; font-family: Arial, sans-serif; padding: 40px;">
      <h2 style="margin-bottom: 8px;">📍 ${shopName}</h2>
      <p style="color: #666; margin-bottom: 24px;">Scan to write a review</p>
      <img src="${imgData}" style="width: 300px; height: 300px;" />
      <p style="color: #999; margin-top: 16px; font-size: 13px;">Powered by AutoReview</p>
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
});

// --- Load Shops List ---
async function loadShops() {
  try {
    const res = await authFetch('/api/shops');
    const shops = await res.json();

    if (shops.length === 0) {
      noShops.classList.remove('hidden');
      shopList.innerHTML = '';
      shopList.appendChild(noShops);
      return;
    }

    noShops.classList.add('hidden');
    shopList.innerHTML = '';

    shops.forEach(shop => {
      const li = document.createElement('li');
      li.className = 'shop-item';
      li.innerHTML = `
        <div class="shop-info">
          <div class="shop-name">${escapeHtml(shop.name)}</div>
          <div class="shop-category">${escapeHtml(shop.category)} · ${escapeHtml(shop.language)}</div>
        </div>
        <div class="shop-actions">
          <button class="btn btn-outline btn-sm" onclick="showQR('${shop.id}')" title="Show QR Code">📱</button>
          <button class="btn btn-outline btn-sm" onclick="editShop('${shop.id}')" title="Edit Shop">✏️</button>
          <button class="btn btn-outline btn-sm" onclick="deleteShop('${shop.id}')" title="Delete">🗑️</button>
        </div>
      `;
      shopList.appendChild(li);
    });
  } catch (err) {
    console.error('Error loading shops:', err);
  }
}

// --- Edit existing shop ---
window.editShop = async function(shopId) {
  try {
    const res = await authFetch(`/api/shops/${shopId}`);
    if (!res.ok) throw new Error('Shop not found');
    const shop = await res.json();

    currentShopId = shop.id;
    document.getElementById('shop-name').value = shop.name || '';
    document.getElementById('google-maps-url').value = shop.googleMapsUrl || '';
    document.getElementById('place-id').value = shop.placeId || '';
    document.getElementById('category').value = shop.category || 'General Store';
    document.getElementById('language').value = shop.language || 'English';
    document.getElementById('description').value = shop.description || '';

    generateQRCode(shop.id);
    document.getElementById('setup-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`✏️ Editing "${shop.name}"`);
  } catch (err) {
    showToast('❌ Error loading shop for edit');
  }
};

// --- Show QR for existing shop ---
window.showQR = function(shopId) {
  currentShopId = shopId;
  generateQRCode(shopId);
  qrCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// --- Delete Shop ---
window.deleteShop = async function(shopId) {
  if (!confirm('Delete this shop?')) return;

  try {
    await authFetch(`/api/shops/${shopId}`, { method: 'DELETE' });
    showToast('🗑️ Shop deleted');
    loadShops();

    if (currentShopId === shopId) {
      qrCard.classList.add('hidden');
      currentShopId = null;
    }
  } catch (err) {
    showToast('❌ Error deleting shop');
  }
};

// --- Toast ---
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// --- Utility ---
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
