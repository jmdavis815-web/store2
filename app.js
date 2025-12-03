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
    price: 0.01,
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

// ... everything you already have above stays the same ...

// =======================
//  GLOBAL EXPORTS (existing)
// =======================
window.PRODUCT_DATA = PRODUCT_DATA;
window.INVENTORY = INVENTORY;
window.saveInventory = saveInventory;
window.updateStockDisplays = updateStockDisplays;
window.logPageView = logPageView;

// =======================
//  CART UTILITIES
// =======================

const CART_KEY = "magicMoonCart"; // same key used by cart.html / cart.js

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch (e) {
    console.error("Error reading cart from localStorage:", e);
    return {};
  }
}

function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (e) {
    console.error("Error saving cart to localStorage:", e);
  }

  // After any change, refresh UI
  updateCartSummary();
  updateDisplayedQuantities();
}

function getCartCount(cart) {
  const c = cart || getCart();
  return Object.values(c).reduce((sum, qty) => sum + (qty || 0), 0);
}

function getCartTotal(cart) {
  const c = cart || getCart();
  let total = 0;
  for (const [id, qty] of Object.entries(c)) {
    const product = PRODUCT_DATA[id];
    if (!product) continue;
    const price = Number(product.price || 0);
    total += price * (qty || 0);
  }
  return total;
}

// Navbar badge + total
function updateCartSummary() {
  const cart  = getCart();
  const count = getCartCount(cart);
  const total = getCartTotal(cart);

  const badge   = document.getElementById("cartBadge");
  const totalEl = document.getElementById("cartTotal");
  const countEl = document.getElementById("cartItemCount"); // optional, if you add it later

  if (badge) {
    badge.textContent = count > 0 ? count : "";
  }
  if (totalEl) {
    totalEl.textContent = `$${total.toFixed(2)}`;
  }
  if (countEl) {
    countEl.textContent = count === 1 ? "1 item" : `${count} items`;
  }
}

// Per-product quantities (the middle button with id="qty-<id>")
function updateDisplayedQuantities() {
  const cart = getCart();

  document.querySelectorAll("[id^='qty-']").forEach((el) => {
    const id = el.id.replace("qty-", "");
    const qty = cart[id] || 0;
    el.textContent = qty;
  });
}

// Toast when adding
function showAddToast() {
  const toastEl = document.getElementById("cartToast");
  if (!toastEl || !window.bootstrap) return;
  const toast = window.bootstrap.Toast.getOrCreateInstance(toastEl);
  toast.show();
}

// Called by your plus/minus buttons
function changeQty(id, delta) {
  const cart = getCart();
  cart[id] = (cart[id] || 0) + delta;

  if (cart[id] <= 0) {
    delete cart[id];
  }

  saveCart(cart);

  if (delta > 0) {
    showAddToast();
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

  // Cart UI (navbar + qty buttons)
  updateCartSummary();
  updateDisplayedQuantities();
});

// =======================
//  GLOBAL EXPORTS
// =======================

window.PRODUCT_DATA = PRODUCT_DATA;
window.INVENTORY = INVENTORY;
window.saveInventory = saveInventory;
window.updateStockDisplays = updateStockDisplays;
window.logPageView = logPageView;

// Cart exports for inline HTML / other scripts
window.getCart = getCart;
window.getCartCount = getCartCount;
window.getCartTotal = getCartTotal;
window.updateCartSummary = updateCartSummary;
window.updateDisplayedQuantities = updateDisplayedQuantities;
window.changeQty = changeQty;

