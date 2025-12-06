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
    price: 14.99, // test price
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
  },
  heartPainting: {
    id: "heartPainting",
    name: "Heart Painting",
    price: 44.99,
    description: "Canvas painting of a heart.",
    image: "heart-painting.png",
    url: "heart-painting.html",
    stock: 1
  }
  // Add more products here...
};

// =======================
//  INVENTORY (Firestore)
// =======================

let INVENTORY = {}; // Firestore is the source of truth

async function loadInventoryFromDB() {
  try {
    const invRef = doc(db, "store", "inventory");
    const snap = await getDoc(invRef);

    if (snap.exists()) {
      const data = snap.data() || {};
      console.log("Inventory from Firestore:", data);

      Object.keys(INVENTORY).forEach((k) => delete INVENTORY[k]);

      for (const [id, product] of Object.entries(PRODUCT_DATA)) {
        const fsVal = data[id];
        if (typeof fsVal === "number") {
          INVENTORY[id] = fsVal;
        } else if (typeof product.stock === "number") {
          INVENTORY[id] = product.stock;
        } else {
          INVENTORY[id] = 0;
        }
      }

      for (const [id, val] of Object.entries(data)) {
        if (!(id in INVENTORY)) {
          INVENTORY[id] = typeof val === "number" ? val : 0;
        }
      }
    } else {
      Object.keys(INVENTORY).forEach((k) => delete INVENTORY[k]);
      for (const [id, product] of Object.entries(PRODUCT_DATA)) {
        INVENTORY[id] =
          typeof product.stock === "number" ? product.stock : 0;
      }
      await setDoc(invRef, INVENTORY);
      console.log("Seeded Firestore inventory with defaults:", INVENTORY);
    }

    updateStockDisplays();
    // 🔔 tell any page (like admin) that inventory is ready
    window.dispatchEvent(new Event("inventory-loaded"));
  } catch (err) {
    console.error("Error loading inventory:", err);
    updateStockDisplays();
    // still fire the event so pages can at least show defaults
    window.dispatchEvent(new Event("inventory-loaded"));
  }
}


async function saveInventory() {
  try {
    const invRef = doc(db, "store", "inventory");

    // Always use the same object the admin page manipulates
    const dataToSave = window.INVENTORY || INVENTORY;

    await setDoc(invRef, dataToSave);
    console.log("Inventory saved:", dataToSave);
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
//  ORDERS + INVENTORY HELPERS
// =======================

async function logSuccessfulTransaction(orderData) {
  try {
    const ordersRef = collection(db, "orders");
    await addDoc(ordersRef, {
      ...orderData,
      createdAt: serverTimestamp()
    });
    console.log("Order logged:", orderData.orderId || "(no orderId)");
  } catch (err) {
    console.error("Error logging successful transaction:", err);
  }
}

/**
 * Decrease inventory based on items in the cart.
 * cartSnapshot is an object like { productId: qty, ... }
 */
async function updateInventoryAfterCheckout(cartSnapshot) {
  try {
    if (!cartSnapshot || typeof cartSnapshot !== "object") return;

    // Adjust local INVENTORY object
    Object.entries(cartSnapshot).forEach(([id, qty]) => {
      const current = typeof INVENTORY[id] === "number" ? INVENTORY[id] : 0;
      const newVal = Math.max(0, current - (qty || 0));
      INVENTORY[id] = newVal;
    });

    // Save to Firestore
    await saveInventory();

    // Refresh "In stock" labels if present
    updateStockDisplays();

    console.log("Inventory updated after checkout", cartSnapshot);
  } catch (err) {
    console.error("Error updating inventory after checkout:", err);
  }
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
  const countEl = document.getElementById("cartItemCount"); // optional

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

// Return how many of this product are actually available
function getEffectiveStock(id) {
  // Prefer live Firestore inventory if present
  if (typeof INVENTORY[id] === "number") {
    return INVENTORY[id];
  }

  // Fallback to the default in PRODUCT_DATA
  const product = PRODUCT_DATA[id];
  if (product && typeof product.stock === "number") {
    return product.stock;
  }

  // If we don't know, don't block adding
  return Infinity;
}

// Called by your plus/minus buttons
function changeQty(id, delta) {
  const cart = getCart();
  const currentQty = cart[id] || 0;
  const maxStock = getEffectiveStock(id);

  // If we're trying to add and we're already at stock, block it
  if (delta > 0 && currentQty >= maxStock) {
    // Optional: show a message to the user
    alert("You've added all we currently have in stock for this item.");
    return;
  }

  let newQty = currentQty + delta;

  // Don't allow negative or zero → remove from cart
  if (newQty <= 0) {
    delete cart[id];
  } else {
    // Clamp to stock just in case
    if (newQty > maxStock) newQty = maxStock;
    cart[id] = newQty;
  }

  saveCart(cart);

  if (delta > 0 && newQty > currentQty) {
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

// Orders + inventory helpers for cart.js and admin
window.logSuccessfulTransaction = logSuccessfulTransaction;
window.updateInventoryAfterCheckout = updateInventoryAfterCheckout;
