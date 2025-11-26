// =======================
//  FIREBASE SETUP
// =======================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDS7_y8tvBkbBk48OD8z6XzU9e1_s_zqyI",
  authDomain: "magicmoonstore-776e1.firebaseapp.com",
  projectId: "magicmoonstore-776e1",
  storageBucket: "magicmoonstore-776e1.firebasestorage.app",
  messagingSenderId: "74334250156",
  appId: "1:74334250156:web:78f4a3937c5795155eeb09",
  measurementId: "G-VN37CQNL8V"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// =======================
//  PRODUCT CATALOG
// =======================
// Used by search.html and admin inventory/dashboard
const PRODUCT_DATA = {
  chakraWater: {
    id: "chakraWater",
    name: "Chakra Water",
    price: 24.99,
    description: "Reiki infused water",
    image: "chakra-water.png",
    url: "chakra-water.html",
    stock: 5
  },
  protectionCandle: {
    id: "protectionCandle",
    name: "Protection Candle",
    price: 12.99,
    description: "Hand-poured protection spell candle.",
    image: "protection-candle-img.png",
    url: "protection-candle.html",
    stock: 10
  }
  // Add more products here...
};

// =======================
//  INVENTORY (Firestore)
// =======================

let INVENTORY = {};

// Load defaults from PRODUCT_DATA
for (const [id, product] of Object.entries(PRODUCT_DATA)) {
  if (typeof product.stock === "number") {
    INVENTORY[id] = product.stock;
  }
}

async function loadInventoryFromDB() {
  try {
    const invRef = doc(db, "store", "inventory");
    const snap = await getDoc(invRef);

    if (snap.exists()) {
      Object.assign(INVENTORY, snap.data());
    } else {
      await setDoc(invRef, INVENTORY);
    }

    updateStockDisplays();
  } catch (err) {
    console.error("Error loading inventory:", err);
    updateStockDisplays();
  }
}

async function saveInventory() {
  try {
    const invRef = doc(db, "store", "inventory");
    await setDoc(invRef, INVENTORY);
  } catch (err) {
    console.error("Error saving inventory:", err);
  }
}

function updateStockDisplays() {
  Object.keys(INVENTORY).forEach((id) => {
    const stockEl = document.getElementById(`stock-${id}`);
    if (!stockEl) return;

    const amount = INVENTORY[id] ?? 0;
    if (amount <= 0) {
      stockEl.textContent = "Out of stock";
      stockEl.classList.add("text-danger");
    } else {
      stockEl.textContent = `In stock: ${amount}`;
      stockEl.classList.remove("text-danger");
    }
  });
}

// =======================
//  VIEW TRACKING
// =======================

async function logPageView() {
  try {
    // Don't count admin pages as "views"
    if (location.pathname.includes("admin")) return;

    // 1) Update total view counter
    const statsRef = doc(db, "store", "stats");
    const statsSnap = await getDoc(statsRef);

    if (statsSnap.exists()) {
      const data = statsSnap.data() || {};
      const current = typeof data.pageViews === "number" ? data.pageViews : 0;
      await setDoc(
        statsRef,
        { pageViews: current + 1 },
        { merge: true }
      );
    } else {
      await setDoc(statsRef, { pageViews: 1 }, { merge: true });
    }

    // 2) Log individual view event (for graphs)
    await addDoc(collection(db, "viewEvents"), {
      path: window.location.pathname,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Error logging page view:", err);
  }
}

// =======================
//  DOM WIRING
// =======================

document.addEventListener("DOMContentLoaded", () => {
  // Optional page fade-in (uses your CSS)
  document.body.classList.add("page-loaded");

  // Log a view for any non-admin page
  logPageView();

  // Sync inventory from Firestore and update "In stock" labels
  loadInventoryFromDB();
  updateStockDisplays();
});

// =======================
//  GLOBAL EXPORTS
// =======================
window.PRODUCT_DATA = PRODUCT_DATA;
window.INVENTORY = INVENTORY;
window.saveInventory = saveInventory;
window.updateStockDisplays = updateStockDisplays;
window.logPageView = logPageView;
