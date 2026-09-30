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

// --- Data Store (JSON file) ---
const DATA_DIR = path.join(__dirname, 'data');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SHOPS_FILE)) {
  fs.writeFileSync(SHOPS_FILE, JSON.stringify([], null, 2));
}

function readShops() {
  return JSON.parse(fs.readFileSync(SHOPS_FILE, 'utf-8'));
}

function writeShops(shops) {
  fs.writeFileSync(SHOPS_FILE, JSON.stringify(shops, null, 2));
}

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

// --- Create or Update a shop (Admin Only) ---
app.post('/api/shops', authMiddleware, (req, res) => {
  try {
    const { id, name, googleMapsUrl, placeId, category, language, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Shop name is required' });
    }

    const shops = readShops();

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
      shops[existingIndex] = {
        ...shops[existingIndex],
        name,
        googleMapsUrl: googleMapsUrl || shops[existingIndex].googleMapsUrl,
        placeId: placeId || shops[existingIndex].placeId,
        category: category || shops[existingIndex].category,
        language: language || shops[existingIndex].language,
        description: description ?? shops[existingIndex].description,
        updatedAt: new Date().toISOString(),
      };
      writeShops(shops);
      return res.status(200).json(shops[existingIndex]);
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

    shops.push(shop);
    writeShops(shops);

    res.status(201).json(shop);
  } catch (err) {
    console.error('Error creating shop:', err);
    res.status(500).json({ error: 'Failed to create shop' });
  }
});

// --- Get all shops (Admin Only) ---
app.get('/api/shops', authMiddleware, (req, res) => {
  try {
    const shops = readShops();
    res.json(shops);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read shops' });
  }
});

// --- Get a single shop (Public - Used by Customer Review Page) ---
app.get('/api/shops/:id', (req, res) => {
  try {
    const shops = readShops();
    const shop = shops.find(s => s.id === req.params.id);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    res.json(shop);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read shop' });
  }
});

// --- Update a shop (Admin Only) ---
app.put('/api/shops/:id', authMiddleware, (req, res) => {
  try {
    const shops = readShops();
    const index = shops.findIndex(s => s.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const { name, googleMapsUrl, placeId, category, language, description } = req.body;
    shops[index] = {
      ...shops[index],
      name: name || shops[index].name,
      googleMapsUrl: googleMapsUrl ?? shops[index].googleMapsUrl,
      placeId: placeId ?? shops[index].placeId,
      category: category || shops[index].category,
      language: language || shops[index].language,
      description: description ?? shops[index].description,
    };

    writeShops(shops);
    res.json(shops[index]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shop' });
  }
});

// --- Delete a shop (Admin Only) ---
app.delete('/api/shops/:id', authMiddleware, (req, res) => {
  try {
    let shops = readShops();
    const index = shops.findIndex(s => s.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    shops.splice(index, 1);
    writeShops(shops);
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
app.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log(`\n🚀 AutoReview server running:`);
  console.log(`   💻 Computer: http://localhost:${PORT}/admin`);
  console.log(`   📱 Phone:    http://${localIp}:${PORT}/admin\n`);

  if (!genAI) {
    console.log('   ⚠️  Gemini API key not set! Add it to your .env file.\n');
  }
});
