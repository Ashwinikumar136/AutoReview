// ==========================================
//   AutoReview — Customer Review Page Logic
// ==========================================

// --- State ---
let shopData = null;
let selectedRating = 0;
let selectedTags = [];
let currentStep = 1;

// --- Tag options by category ---
const TAG_OPTIONS = {
  default: [
    { icon: '👍', label: 'Great Service' },
    { icon: '😊', label: 'Friendly Staff' },
    { icon: '💰', label: 'Good Prices' },
    { icon: '✨', label: 'Clean & Neat' },
    { icon: '⚡', label: 'Fast Service' },
    { icon: '📍', label: 'Easy to Find' },
    { icon: '🔄', label: 'Will Visit Again' },
    { icon: '👨‍👩‍👧', label: 'Family Friendly' },
    { icon: '📦', label: 'Good Variety' },
    { icon: '💎', label: 'Good Quality' },
  ],
  'Restaurant': [
    { icon: '😋', label: 'Delicious Food' },
    { icon: '😊', label: 'Friendly Staff' },
    { icon: '✨', label: 'Clean Place' },
    { icon: '💰', label: 'Worth the Price' },
    { icon: '⚡', label: 'Quick Service' },
    { icon: '📋', label: 'Great Menu' },
    { icon: '🍽️', label: 'Good Portions' },
    { icon: '🌿', label: 'Fresh Ingredients' },
    { icon: '🎉', label: 'Nice Ambiance' },
    { icon: '🔄', label: 'Will Come Again' },
  ],
  'Cafe': [
    { icon: '☕', label: 'Great Coffee' },
    { icon: '😊', label: 'Cozy Atmosphere' },
    { icon: '🍰', label: 'Tasty Snacks' },
    { icon: '📶', label: 'Good WiFi' },
    { icon: '💰', label: 'Fair Prices' },
    { icon: '✨', label: 'Clean & Pretty' },
    { icon: '😊', label: 'Friendly Staff' },
    { icon: '📚', label: 'Good for Work' },
    { icon: '🎵', label: 'Nice Music' },
    { icon: '🔄', label: 'My Go-To Cafe' },
  ],
  'Salon / Spa': [
    { icon: '💇', label: 'Great Haircut' },
    { icon: '😊', label: 'Friendly Stylist' },
    { icon: '✨', label: 'Clean & Hygienic' },
    { icon: '💰', label: 'Good Prices' },
    { icon: '💆', label: 'Very Relaxing' },
    { icon: '🎨', label: 'Skilled Staff' },
    { icon: '⏰', label: 'On Time' },
    { icon: '💎', label: 'Premium Products' },
    { icon: '🪑', label: 'Comfortable' },
    { icon: '🔄', label: 'Regular Customer' },
  ],
  'Electronics Store': [
    { icon: '📱', label: 'Great Products' },
    { icon: '😊', label: 'Helpful Staff' },
    { icon: '💰', label: 'Best Prices' },
    { icon: '🔧', label: 'Good After-Sales' },
    { icon: '✅', label: 'Genuine Products' },
    { icon: '📦', label: 'Wide Selection' },
    { icon: '💡', label: 'Expert Advice' },
    { icon: '⚡', label: 'Quick Billing' },
    { icon: '🛡️', label: 'Good Warranty' },
    { icon: '🔄', label: 'Will Buy Again' },
  ],
  'Medical / Pharmacy': [
    { icon: '💊', label: 'All Medicines Available' },
    { icon: '😊', label: 'Helpful Pharmacist' },
    { icon: '💰', label: 'Fair Prices' },
    { icon: '⚡', label: 'Quick Service' },
    { icon: '🏥', label: 'Professional' },
    { icon: '📋', label: 'Good Advice' },
    { icon: '✨', label: 'Clean Store' },
    { icon: '🕐', label: 'Open Late' },
    { icon: '🚗', label: 'Home Delivery' },
    { icon: '🔄', label: 'Trusted Shop' },
  ],
  'Hotel / Lodge': [
    { icon: '🛏️', label: 'Comfortable Rooms' },
    { icon: '✨', label: 'Very Clean' },
    { icon: '😊', label: 'Great Staff' },
    { icon: '💰', label: 'Good Value' },
    { icon: '📍', label: 'Great Location' },
    { icon: '🍳', label: 'Nice Breakfast' },
    { icon: '📶', label: 'Good WiFi' },
    { icon: '🅿️', label: 'Easy Parking' },
    { icon: '🔇', label: 'Quiet & Peaceful' },
    { icon: '🔄', label: 'Will Stay Again' },
  ],
};

// Negative tags for low ratings
const NEGATIVE_TAGS = [
  { icon: '😔', label: 'Poor Service' },
  { icon: '⏰', label: 'Long Wait' },
  { icon: '💸', label: 'Overpriced' },
  { icon: '🙁', label: 'Rude Staff' },
  { icon: '🚫', label: 'Not Clean' },
  { icon: '📉', label: 'Low Quality' },
  { icon: '😤', label: 'Disappointing' },
  { icon: '🔇', label: 'Ignored by Staff' },
];

const RATING_LABELS = [
  '',
  '😞 Terrible',
  '😕 Could be better',
  '😐 It was okay',
  '😊 Great experience!',
  '🤩 Absolutely loved it!',
];

// --- DOM Elements ---
const shopTitle = document.getElementById('shop-title');
const stepDots = document.querySelectorAll('.step-dot');
const stars = document.querySelectorAll('.star');
const ratingLabel = document.getElementById('rating-label');
const tagsContainer = document.getElementById('tags-container');
const commentsInput = document.getElementById('comments');
const voiceBtn = document.getElementById('voice-btn');
const reviewText = document.getElementById('review-text');
const toast = document.getElementById('toast');

// Step elements
const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const step3 = document.getElementById('step-3');
const stepSuccess = document.getElementById('step-success');
const errorCard = document.getElementById('error-card');

// Buttons
const step1Next = document.getElementById('step1-next');
const step2Back = document.getElementById('step2-back');
const step2Next = document.getElementById('step2-next');
const regenerateBtn = document.getElementById('regenerate-btn');
const postGoogleBtn = document.getElementById('post-google-btn');
const writeAnotherBtn = document.getElementById('write-another-btn');

// --- Initialize ---
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const params = new URLSearchParams(window.location.search);
  const shopId = params.get('shop');

  if (!shopId) {
    showError();
    return;
  }

  try {
    const res = await fetch(`/api/shops/${shopId}`);
    if (!res.ok) throw new Error('Shop not found');

    shopData = await res.json();
    shopTitle.textContent = shopData.name;
    document.title = `Review — ${shopData.name}`;

    setupStars();
    setupNavigation();
    setupVoiceInput();
  } catch (err) {
    showError();
  }
}

// --- Stars ---
function setupStars() {
  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.dataset.value);
      updateStars();
      step1Next.disabled = false;
    });
  });
}

function updateStars() {
  stars.forEach(star => {
    const val = parseInt(star.dataset.value);
    star.classList.toggle('active', val <= selectedRating);
  });
  ratingLabel.textContent = RATING_LABELS[selectedRating] || '';
}

// --- Tags ---
function populateTags() {
  tagsContainer.innerHTML = '';

  let tags;
  if (selectedRating <= 2) {
    tags = NEGATIVE_TAGS;
  } else {
    const category = shopData?.category || 'default';
    tags = TAG_OPTIONS[category] || TAG_OPTIONS.default;
  }

  tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag';
    chip.innerHTML = `<span class="tag-icon">${tag.icon}</span> ${tag.label}`;
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      if (chip.classList.contains('active')) {
        selectedTags.push(tag.label);
      } else {
        selectedTags = selectedTags.filter(t => t !== tag.label);
      }
    });
    tagsContainer.appendChild(chip);
  });
}

// --- Navigation ---
function setupNavigation() {
  step1Next.addEventListener('click', () => {
    if (selectedRating === 0) return;
    populateTags();
    goToStep(2);
  });

  step2Back.addEventListener('click', () => goToStep(1));

  step2Next.addEventListener('click', () => {
    goToStep(3);
    generateReview();
  });

  regenerateBtn.addEventListener('click', generateReview);

  postGoogleBtn.addEventListener('click', postToGoogle);

  writeAnotherBtn.addEventListener('click', () => {
    selectedRating = 0;
    selectedTags = [];
    commentsInput.value = '';
    reviewText.innerHTML = '<span class="placeholder">Generating your review...</span>';
    updateStars();
    step1Next.disabled = true;
    goToStep(1);
  });
}

function goToStep(step) {
  currentStep = step;

  // Hide all step cards
  document.querySelectorAll('.step-card').forEach(el => el.classList.add('hidden'));

  // Show target
  if (step === 'success') {
    stepSuccess.classList.remove('hidden');
  } else {
    document.getElementById(`step-${step}`).classList.remove('hidden');
  }

  // Update dots
  stepDots.forEach(dot => {
    const dotStep = parseInt(dot.dataset.step);
    dot.classList.toggle('active', dotStep === step);
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Generate Review ---
async function generateReview() {
  reviewText.innerHTML = '<span class="placeholder" style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 20px 0;"><span class="spinner" style="width: 22px; height: 22px; border: 2.5px solid #fde68a; border-top-color: #d97706;"></span> ✨ Writing your review...</span>';
  regenerateBtn.disabled = true;
  postGoogleBtn.disabled = true;

  try {
    const res = await fetch('/api/generate-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopName: shopData.name,
        category: shopData.category,
        rating: selectedRating,
        tags: selectedTags,
        comments: commentsInput.value.trim(),
        language: shopData.language,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to generate review');
    }

    const data = await res.json();
    reviewText.textContent = data.review;

  } catch (err) {
    reviewText.innerHTML = `<span class="placeholder">❌ ${err.message}</span>`;
    showToast('❌ Error generating review');
    console.error(err);
  } finally {
    regenerateBtn.disabled = false;
    postGoogleBtn.disabled = false;
  }
}

// --- Post to Google ---
async function postToGoogle() {
  const review = reviewText.textContent.trim();

  if (!review || review.startsWith('✨') || review.startsWith('❌')) {
    showToast('⚠️ Please generate a review first');
    return;
  }

  // Copy to clipboard
  try {
    await navigator.clipboard.writeText(review);
    showToast('📋 Review copied to clipboard!');
  } catch {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = review;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('📋 Review copied!');
  }

  // Open Google Maps review page
  setTimeout(() => {
    let googleUrl;
    let isDirect = false;

    // A valid Google Place ID typically starts with "ChIJ"
    if (shopData.placeId && shopData.placeId.startsWith('ChIJ')) {
      googleUrl = `https://search.google.com/local/writereview?placeid=${shopData.placeId}`;
      isDirect = true;
    } else if (shopData.googleMapsUrl) {
      googleUrl = shopData.googleMapsUrl;
      if (googleUrl.includes('/writereview') || googleUrl.includes('g.page/r/') || googleUrl.includes('/review')) {
        isDirect = true;
      }
    } else {
      googleUrl = `https://www.google.com/maps/search/${encodeURIComponent(shopData.name)}`;
    }

    const instructionsEl = document.getElementById('success-instructions');
    if (instructionsEl) {
      if (isDirect) {
        instructionsEl.innerHTML = `
          <strong>Next step on Google:</strong><br>
          1. The review box is open in your other tab.<br>
          2. Long-press or right-click to <strong>Paste</strong> your review.<br>
          3. Select your stars and tap <strong>Post</strong>!
        `;
      } else {
        instructionsEl.innerHTML = `
          <strong>Next step on Google Maps:</strong><br>
          1. On the shop page that opened, tap <strong>"Rate and review"</strong> (or the 5 stars ⭐).<br>
          2. <strong>Paste</strong> your copied review 📋.<br>
          3. Tap <strong>Post</strong> 🚀!
        `;
      }
    }

    window.open(googleUrl, '_blank');
    goToStep('success');
  }, 800);
}

// --- Voice Input ---
function setupVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    voiceBtn.style.display = 'none';
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  // Set language based on shop config
  const langMap = {
    'English': 'en-IN',
    'Hindi': 'hi-IN',
    'Hinglish (Hindi + English mix)': 'hi-IN',
    'Tamil': 'ta-IN',
    'Telugu': 'te-IN',
    'Marathi': 'mr-IN',
    'Bengali': 'bn-IN',
    'Gujarati': 'gu-IN',
    'Kannada': 'kn-IN',
    'Punjabi': 'pa-IN',
    'Urdu': 'ur-IN',
  };

  recognition.lang = langMap[shopData?.language] || 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;

  let isRecording = false;

  voiceBtn.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
      voiceBtn.classList.remove('recording');
      isRecording = false;
    } else {
      recognition.start();
      voiceBtn.classList.add('recording');
      isRecording = true;
      showToast('🎤 Listening... speak now');
    }
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    commentsInput.value += (commentsInput.value ? ' ' : '') + transcript;
    voiceBtn.classList.remove('recording');
    isRecording = false;
    showToast('✅ Got it!');
  };

  recognition.onerror = (event) => {
    voiceBtn.classList.remove('recording');
    isRecording = false;
    if (event.error !== 'aborted') {
      showToast('❌ Voice input failed. Try again.');
    }
  };

  recognition.onend = () => {
    voiceBtn.classList.remove('recording');
    isRecording = false;
  };
}

// --- Show Error ---
function showError() {
  document.getElementById('review-header').classList.add('hidden');
  document.getElementById('step-dots').classList.add('hidden');
  step1.classList.add('hidden');
  errorCard.classList.remove('hidden');
}

// --- Toast ---
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
