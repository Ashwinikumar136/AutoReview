# 🚀 AutoReview — AI-Assisted Google Reviews Platform

> Help customers write natural, authentic Google Maps reviews with AI in seconds via a simple QR code scan.

AutoReview solves a real problem faced by local businesses: customers often want to leave a review, but struggle to articulate their experience or lack the time/confidence to write one. With AutoReview, customers scan a counter QR code, tap their rating and experience tags, and Google Gemini AI drafts a personalized, natural review ready to post on Google Maps with a single click.

---

## ✨ Features

- **🔒 Password-Protected Admin Panel**: Manage shops, generate QR codes, and customize settings behind secure password authentication.
- **📱 QR Code Generation with Permanent IDs**: Generate printable QR codes for store counters, standees, or receipts that never expire.
- **⚡ Blazing Fast AI Generation (~1.5s)**: Powered by Google Gemini (`gemini-2.5-flash`), delivering full drafts in under 2 seconds.
- **🗣️ Natural & Authentic Phrasing**: Specifically engineered prompts omit repetitive business names and robotic language, ensuring reviews read naturally with genuine first-person perspectives.
- **🌍 Multi-Language Support**: Generates authentic reviews in English, Hindi, Hinglish, Marathi, and other regional languages.
- **🎤 Voice Input**: Customers can speak their experience using built-in speech-to-text.
- **📋 1-Tap Copy & Deep Linking**: Copies text to the clipboard and directly opens the Google Maps review dialog.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **AI Engine**: Google Gemini API (`@google/generative-ai`)
- **Frontend**: Vanilla JavaScript, HTML5, Modern Responsive CSS
- **QR Codes**: QRCode.js

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/Ashwinikumar136/AutoReview.git
cd AutoReview
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
ADMIN_PASSWORD=your_secure_admin_password
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?appName=AutoReview (Optional, for 100% cloud persistence)
```
> Get a free Gemini API key at [Google AI Studio](https://aistudio.google.com/).

### 4. Start the server
```bash
npm start
```

Visit the application:
- **Admin Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin) (Log in with your `ADMIN_PASSWORD`)
- **Customer Review Flow**: `http://localhost:3000/review?shop=SHOP_ID`

---

## 📱 Mobile Testing (Local Network)
When testing on a mobile device on the same local Wi-Fi:
1. Start the server on your computer.
2. The server outputs your local network IP (e.g., `http://192.168.1.X:3000/admin`).
3. Scan the generated QR code from your phone's camera to experience the customer review flow.

---

## 🌐 Production Deployment

AutoReview can be deployed on any Node.js hosting platform (such as [Render](https://render.com), [Railway](https://railway.app), or a VPS):

1. Set your environment variables on your hosting dashboard:
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `ADMIN_PASSWORD`: Your admin panel password
   - `MONGODB_URI`: (Recommended for Render) Your MongoDB Atlas connection string so all new shops persist across redeployments
   - `PORT`: (Set automatically by Render)
2. Build / Start command:
   - Build: `npm install`
   - Start: `node server.js`
3. Print your final QR codes from the live URL and display them on physical shop counters!

---

## 📄 License
MIT License. Free to use and customize.
