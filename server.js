require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Data Store (Dual-Engine: MongoDB Atlas + Local JSON Fallback) ---
const DATA_DIR = path.join(__dirname, 'data');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');
const SEED_FILE = path.join(DATA_DIR, 'seed_shops.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getSeedShops() {
  if (fs.existsSync(SEED_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      console.warn('Could not read seed_shops.json:', e.message);
    }
  }
  return [];
}

let mongoClient = null;
let shopsCollection = null;
let storageMode = 'local'; // 'mongodb' | 'local'

async function initStorage() {
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && mongoUri.startsWith('mongodb')) {
    try {
      console.log('Connecting to MongoDB Atlas...');
      const { MongoClient } = require('mongodb');
      mongoClient = new MongoClient(mongoUri);
      await mongoClient.connect();
      const db = mongoClient.db(process.env.MONGODB_DB_NAME || 'autoreview');
      shopsCollection = db.collection('shops');
      storageMode = 'mongodb';
      console.log('✅ Connected to MongoDB Atlas Cloud Database.');

      // Check if MongoDB collection is empty; if so, auto-seed
      const count = await shopsCollection.countDocuments();
      if (count === 0) {
        let initialData = [];
        if (fs.existsSync(SHOPS_FILE)) {
          try {
            initialData = JSON.parse(fs.readFileSync(SHOPS_FILE, 'utf-8'));
          } catch (_) {}
        }
        if (!initialData.length) {
          initialData = getSeedShops();
        }
        if (initialData.length > 0) {
          console.log(`Seeding MongoDB with ${initialData.length} shop(s)...`);
          await shopsCollection.insertMany(initialData);
        }
      }
      return;
    } catch (err) {
      console.error('⚠️ Failed to connect to MongoDB Atlas:', err.message);
      console.log('Falling back to local JSON storage...');
      storageMode = 'local';
    }
  }

  // Local JSON setup
  storageMode = 'local';
  if (!fs.existsSync(SHOPS_FILE)) {
    const seeds = getSeedShops();
    fs.writeFileSync(SHOPS_FILE, JSON.stringify(seeds, null, 2));
    console.log(`Initialized local shops.json with ${seeds.length} seed shop(s).`);
  } else {
    // If shops.json exists but is empty array, seed it
    try {
      const existing = JSON.parse(fs.readFileSync(SHOPS_FILE, 'utf-8'));
      if (!Array.isArray(existing) || existing.length === 0) {
        const seeds = getSeedShops();
        fs.writeFileSync(SHOPS_FILE, JSON.stringify(seeds, null, 2));
      }
    } catch (_) {}
  }
  console.log(`📁 Using local storage: ${SHOPS_FILE}`);
}

const shopStore = {
  getStorageMode: () => storageMode,

  async getAll() {
    if (storageMode === 'mongodb' && shopsCollection) {
      return await shopsCollection.find({}, { projection: { _id: 0 } }).toArray();
    }
    if (!fs.existsSync(SHOPS_FILE)) return [];
    try {
      return JSON.parse(fs.readFileSync(SHOPS_FILE, 'utf-8'));
    } catch (_) {
      return [];
    }
  },

  async getById(id) {
    if (storageMode === 'mongodb' && shopsCollection) {
      return await shopsCollection.findOne({ id }, { projection: { _id: 0 } });
    }
    const shops = await this.getAll();
    return shops.find(s => s.id === id) || null;
  },

  async save(shop) {
    if (storageMode === 'mongodb' && shopsCollection) {
      await shopsCollection.updateOne(
        { id: shop.id },
        { $set: shop },
        { upsert: true }
      );
      return shop;
    }
    const shops = await this.getAll();
    const idx = shops.findIndex(s => s.id === shop.id);
    if (idx !== -1) {
      shops[idx] = shop;
    } else {
      shops.push(shop);
    }
    fs.writeFileSync(SHOPS_FILE, JSON.stringify(shops, null, 2));
    return shop;
  },

  async delete(id) {
    if (storageMode === 'mongodb' && shopsCollection) {
      const result = await shopsCollection.deleteOne({ id });
      return result.deletedCount > 0;
    }
    const shops = await this.getAll();
    const filtered = shops.filter(s => s.id !== id);
    if (filtered.length !== shops.length) {
      fs.writeFileSync(SHOPS_FILE, JSON.stringify(filtered, null, 2));
      return true;
    }
    return false;
  },

  async importAll(newShops) {
    if (!Array.isArray(newShops)) throw new Error('Data must be an array of shops');
    if (storageMode === 'mongodb' && shopsCollection) {
      await shopsCollection.deleteMany({});
      if (newShops.length > 0) {
        const sanitized = newShops.map(s => {
          const { _id, ...rest } = s;
          return rest;
        });
        await shopsCollection.insertMany(sanitized);
      }
      return newShops;
    }
    fs.writeFileSync(SHOPS_FILE, JSON.stringify(newShops, null, 2));
    return newShops;
  }
};

// --- Gemini AI Setup ---
let genAI = null;

// Fastest, highest-availability models first
const MODELS_TO_TRY = ['gemini-2.5-flash', 'gemini-3.5-flash-lite'];

if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Helper: fast content generation with immediate fallback
async function generateWithFallback(prompt) {
  if (!genAI) throw new Error('Gemini API key not configured');

  const errors = [];

  for (const modelName of MODELS_TO_TRY) {
    try {
      console.log(`Generating review with ${modelName}...`);
      const t0 = Date.now();
      const generationConfig = { temperature: 0.7 };
      if (modelName === 'gemini-2.5-flash') {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      console.log(`⚡ Review generated in ${Date.now() - t0}ms via ${modelName}`);
      return text;
    } catch (err) {
      console.warn(`Model ${modelName} failed (${err.status || 'err'}): ${err.message}`);
      errors.push(`${modelName}: ${err.message}`);
    }
  }

  throw new Error(`All models failed. Last error: ${errors[errors.length - 1]}`);
}

// ==========================
//   ADMIN AUTHENTICATION
// ==========================

const activeSessions = new Set();

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication required' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }

  next();
}

// Admin Login
app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (!password || password !== adminPassword) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Check Admin Session Status
app.get('/api/admin/check', authMiddleware, (req, res) => {
  res.json({ authenticated: true });
});

// Admin Logout
app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

// ==========================
//        API ROUTES
// ==========================

// --- Storage & Admin Status ---
app.get('/api/admin/status', authMiddleware, async (req, res) => {
  try {
    const shops = await shopStore.getAll();
    res.json({
      storageMode: shopStore.getStorageMode(),
      totalShops: shops.length,
      hasGemini: !!genAI,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// --- Export Shops Backup (JSON file download) ---
app.get('/api/admin/export', authMiddleware, async (req, res) => {
  try {
    const shops = await shopStore.getAll();
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="autoreview-backup-${dateStr}.json"`);
    res.send(JSON.stringify(shops, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to export backup' });
  }
});

// --- Import Shops Backup (JSON restore) ---
app.post('/api/admin/import', authMiddleware, async (req, res) => {
  try {
    const { shops } = req.body;
    if (!Array.isArray(shops)) {
      return res.status(400).json({ error: 'Payload must contain a "shops" array' });
    }
    await shopStore.importAll(shops);
    res.json({ success: true, count: shops.length });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import shops: ' + err.message });
  }
});

// --- Create or Update a shop (Admin Only) ---
app.post('/api/shops', authMiddleware, async (req, res) => {
  try {
    const { id, name, googleMapsUrl, placeId, category, language, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Shop name is required' });
    }

    const shops = await shopStore.getAll();

    // Check if shop already exists:
    // 1) Explicit id passed
    // 2) Same Place ID (if non-empty)
    // 3) Same Google Maps URL (if non-empty)
    // 4) Same Shop Name (case-insensitive)
    let existingIndex = -1;
    if (id) {
      existingIndex = shops.findIndex(s => s.id === id);
    }
    if (existingIndex === -1 && placeId && placeId.trim()) {
      existingIndex = shops.findIndex(s => s.placeId && s.placeId.trim() === placeId.trim());
    }
    if (existingIndex === -1 && googleMapsUrl && googleMapsUrl.trim()) {
      existingIndex = shops.findIndex(s => s.googleMapsUrl && s.googleMapsUrl.trim() === googleMapsUrl.trim());
    }
    if (existingIndex === -1 && name && name.trim()) {
      existingIndex = shops.findIndex(s => s.name.trim().toLowerCase() === name.trim().toLowerCase());
    }

    if (existingIndex !== -1) {
      // Update existing shop — preserve the exact same ID so QR code never changes!
      const updatedShop = {
        ...shops[existingIndex],
        name,
        googleMapsUrl: googleMapsUrl || shops[existingIndex].googleMapsUrl,
        placeId: placeId || shops[existingIndex].placeId,
        category: category || shops[existingIndex].category,
        language: language || shops[existingIndex].language,
        description: description ?? shops[existingIndex].description,
        updatedAt: new Date().toISOString(),
      };
      await shopStore.save(updatedShop);
      return res.status(200).json(updatedShop);
    }

    // New shop
    const shop = {
      id: uuidv4(),
      name,
      googleMapsUrl: googleMapsUrl || '',
      placeId: placeId || '',
      category: category || 'General',
      language: language || 'English',
      description: description || '',
      createdAt: new Date().toISOString(),
    };

    await shopStore.save(shop);
    res.status(201).json(shop);
  } catch (err) {
    console.error('Error creating shop:', err);
    res.status(500).json({ error: 'Failed to create shop' });
  }
});

// --- Get all shops (Admin Only) ---
app.get('/api/shops', authMiddleware, async (req, res) => {
  try {
    const shops = await shopStore.getAll();
    res.json(shops);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read shops' });
  }
});

// --- Get a single shop (Public - Used by Customer Review Page) ---
app.get('/api/shops/:id', async (req, res) => {
  try {
    const shop = await shopStore.getById(req.params.id);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    res.json(shop);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read shop' });
  }
});

// --- Update a shop (Admin Only) ---
app.put('/api/shops/:id', authMiddleware, async (req, res) => {
  try {
    const shop = await shopStore.getById(req.params.id);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const { name, googleMapsUrl, placeId, category, language, description } = req.body;
    const updated = {
      ...shop,
      name: name || shop.name,
      googleMapsUrl: googleMapsUrl ?? shop.googleMapsUrl,
      placeId: placeId ?? shop.placeId,
      category: category || shop.category,
      language: language || shop.language,
      description: description ?? shop.description,
      updatedAt: new Date().toISOString(),
    };

    await shopStore.save(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shop' });
  }
});

// --- Delete a shop (Admin Only) ---
app.delete('/api/shops/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await shopStore.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete shop' });
  }
});

// --- Lookup Place ID & Info from Google Maps URL (Admin Only) ---
app.post('/api/lookup-placeid', authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Analyzing Google Maps URL: ${url}`);

    // If it's already a direct review link:
    const isDirectReviewLink = url.includes('/writereview') || url.includes('g.page/r/') || url.includes('/review');

    // Fetch the URL (follows redirects — handles maps.app.goo.gl short links)
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const finalUrl = response.url;
    console.log(`Final URL: ${finalUrl}`);

    // Extract place name from URL: /maps/place/NAME/
    let placeName = null;
    const nameMatch = finalUrl.match(/\/maps\/place\/([^/@?]+)/);
    if (nameMatch) {
      placeName = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
    }

    let placeId = null;

    // Check for Place ID pattern (ChIJ...) in URL or redirect
    const urlMatch = finalUrl.match(/ChIJ[\w_-]{20,}/);
    if (urlMatch) {
      placeId = urlMatch[0];
    }

    // Check query params if any
    try {
      const parsed = new URL(finalUrl);
      const qPlaceId = parsed.searchParams.get('placeid') || parsed.searchParams.get('place_id');
      if (qPlaceId && qPlaceId.startsWith('ChIJ')) {
        placeId = qPlaceId;
      }
    } catch {}

    const isDirect = isDirectReviewLink || !!placeId;

    res.json({
      placeId,
      placeName,
      finalUrl,
      isDirectReview: isDirect,
      reviewUrl: placeId ? `https://search.google.com/local/writereview?placeid=${placeId}` : finalUrl,
    });
  } catch (err) {
    console.error('Error looking up Google Maps URL:', err.message);
    res.status(500).json({ error: 'Failed to inspect URL. Check that it is a valid Google Maps link.' });
  }
});

// --- Generate AI-assisted review ---
app.post('/api/generate-review', async (req, res) => {
  try {
    if (!genAI) {
      return res.status(500).json({
        error: 'Gemini API key not configured. Please set GEMINI_API_KEY in your .env file.',
      });
    }

    const { shopName, category, rating, tags, comments, language } = req.body;

    if (!shopName || !rating) {
      return res.status(400).json({ error: 'Shop name and rating are required' });
    }

    const prompt = `You are assisting a customer in drafting their own authentic Google Maps review for a ${category || 'store/business'}.

Customer's visit details:
- Rating: ${rating}/5 stars
- Highlights: ${tags && tags.length > 0 ? tags.join(', ') : 'Good experience'}
- Customer's notes: ${comments || 'None'}

CRITICAL GUIDELINES FOR AUTHENTICITY:
- DO NOT mention the business name ("${shopName}"). Because the review appears directly on the shop's profile page, repeating the name sounds robotic and artificial.
- Use natural phrasing like "This place", "The shop", "The staff", or start directly with the customer's personal experience (e.g., "Had a great experience here...", "Got what I needed quickly...").
- Language: Write in ${language || 'English'}.
- Length: 2-3 sentences max.
- Tone: Friendly, casual, conversational, and completely human. Match the ${rating}/5 star rating.
- Output ONLY the review text. No quotes, no intro text, no labels.`;

    const review = await generateWithFallback(prompt);
    res.json({ review });
  } catch (err) {
    console.error('Error generating review:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate review.' });
  }
});

// --- Serve admin page ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- Serve review page ---
app.get('/review', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'review.html'));
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// --- Get local network IP for mobile testing ---
app.get('/api/network-info', (req, res) => {
  const localIp = getLocalIp();
  res.json({
    localIp,
    port: PORT,
    networkUrl: `http://${localIp}:${PORT}`,
    adminUrl: `http://${localIp}:${PORT}/admin`,
  });
});

// --- Default redirect to admin ---
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// --- Start Server ---
async function startServer() {
  await initStorage();

  app.listen(PORT, () => {
    const localIp = getLocalIp();
    console.log(`\n🚀 AutoReview server running [Storage: ${shopStore.getStorageMode()}]:`);
    console.log(`   💻 Computer: http://localhost:${PORT}/admin`);
    console.log(`   📱 Phone:    http://${localIp}:${PORT}/admin\n`);

    if (!genAI) {
      console.log('   ⚠️  Gemini API key not set! Add it to your .env file.\n');
    }
  });
}

startServer();
