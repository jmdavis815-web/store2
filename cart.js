window.addEventListener("DOMContentLoaded", () => {
  const CART_KEY = "magicMoonCart";

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || {};
    } catch (err) {
      console.error("Error reading cart from localStorage:", err);
      return {};
    }
  }

  function saveCart(cart) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (err) {
      console.error("Error saving cart to localStorage:", err);
    }
  }

  function getCartCount(cart) {
    return Object.values(cart).reduce((sum, qty) => sum + (qty || 0), 0);
  }

  function updateBadge() {
    const badge = document.getElementById("cartBadge");
    if (!badge) return;
    const cart = getCart();
    const count = getCartCount(cart);
    badge.textContent = count > 0 ? count : "";
  }

  // Wait for PRODUCT_DATA from app.js
  function ensureProducts() {
    return new Promise((resolve) => {
      if (window.PRODUCT_DATA) return resolve(window.PRODUCT_DATA);
      const check = setInterval(() => {
        if (window.PRODUCT_DATA) {
          clearInterval(check);
          resolve(window.PRODUCT_DATA);
        }
      }, 50);
    });
  }

  ensureProducts().then((PRODUCT_DATA) => {
    const cartTableBody   = document.getElementById("cartTableBody");
    const emptyCartState  = document.getElementById("emptyCartState");
    const summaryCard     = document.getElementById("cartSummary");
    const subtotalEl      = document.getElementById("cartSubtotal");
    const taxEl           = document.getElementById("cartTax");
    const shippingEl      = document.getElementById("cartShipping");
    const totalEl         = document.getElementById("cartTotal");
    const paypalContainer = document.getElementById("paypal-button-container");

    const TAX_RATE = 0.08;
    const SHIPPING_FLAT = 8.99;

    function calculateSubtotal() {
      const cart = getCart();
      let subtotal = 0;
      for (const [id, qty] of Object.entries(cart)) {
        const product = PRODUCT_DATA[id];
        if (!product) continue;
        const price = Number(product.price || 0);
        subtotal += price * (qty || 0);
      }
      return subtotal;
    }

    function renderPayPalButtons() {
      if (!paypalContainer || !window.paypal) return;

      const cart = getCart();
      const hasItems = Object.values(cart).some((qty) => qty > 0);
      paypalContainer.innerHTML = "";

      if (!hasItems) return;

      window.paypal
        .Buttons({
          createOrder: (data, actions) => {
            const subtotal = calculateSubtotal();
            const tax = subtotal * TAX_RATE;
            const shipping = subtotal > 0 ? SHIPPING_FLAT : 0;
            const total = (subtotal + tax + shipping).toFixed(2);

            return actions.order.create({
              purchase_units: [
                {
                  amount: {
                    value: total
                  }
                }
              ]
            });
          },
          onApprove: (data, actions) => {
            return actions.order.capture().then((details) => {
              // 🔹 Update inventory in Firestore after successful payment
              const cart = getCart();
              if (window.INVENTORY && window.saveInventory) {
                for (const [id, qty] of Object.entries(cart)) {
                  if (window.INVENTORY[id] != null) {
                    const current = Number(window.INVENTORY[id]) || 0;
                    const newVal = current - (qty || 0);
                    window.INVENTORY[id] = newVal > 0 ? newVal : 0;
                  }
                }

                // Save updated inventory document
                try {
                  window.saveInventory();
                } catch (err) {
                  console.error("Error saving updated inventory:", err);
                }

                // Refresh any "In stock" labels on page
                if (typeof window.updateStockDisplays === "function") {
                  window.updateStockDisplays();
                }
              }

              alert(`Thank you, ${details.payer.name.given_name}! Your payment is complete.`);

              // Clear cart after successful purchase
              localStorage.removeItem(CART_KEY);
              updateBadge();
              renderCart();
            });
          },
          onError: (err) => {
            console.error("PayPal error:", err);
            alert("Something went wrong with PayPal. Please try again.");
          }
        })
        .render("#paypal-button-container");
    }

    function renderCart() {
      const cart = getCart();
      const entries = Object.entries(cart).filter(([_, qty]) => qty > 0);

      cartTableBody.innerHTML = "";

      if (entries.length === 0) {
        emptyCartState.classList.remove("d-none");
        summaryCard.classList.add("d-none");

        if (subtotalEl) subtotalEl.textContent = "$0.00";
        if (taxEl) taxEl.textContent = "$0.00";
        if (shippingEl) shippingEl.textContent = "$0.00";
        if (totalEl) totalEl.textContent = "$0.00";

        updateBadge();
        renderPayPalButtons(); // clears button area
        return;
      }

      emptyCartState.classList.add("d-none");
      summaryCard.classList.remove("d-none");

      let subtotal = 0;

      entries.forEach(([id, qty]) => {
        const product = PRODUCT_DATA[id];
        if (!product) return;

        const price = Number(product.price || 0);
        const lineTotal = price * qty;
        subtotal += lineTotal;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <div class="d-flex align-items-center">
              ${
                product.image
                  ? `<img src="${product.image}" alt="${product.name || id}" class="me-2 rounded" style="width:56px;height:56px;object-fit:cover;">`
                  : ""
              }
              <div>
                <div class="fw-semibold">${product.name || id}</div>
                <small class="text-muted">
                  ${product.description || ""}
                </small>
              </div>
            </div>
          </td>
          <td>$${price.toFixed(2)}</td>
          <td class="text-center">
            <div class="btn-group btn-group-sm" role="group">
              <button type="button" class="btn btn-outline-danger cart-line-minus" data-id="${id}">
                <i class="bi bi-dash"></i>
              </button>
              <button type="button" class="btn btn-outline-secondary" disabled>
                ${qty}
              </button>
              <button type="button" class="btn btn-outline-success cart-line-plus" data-id="${id}">
                <i class="bi bi-plus"></i>
              </button>
            </div>
          </td>
          <td class="text-end">$${lineTotal.toFixed(2)}</td>
        `;
        cartTableBody.appendChild(tr);
      });

      const tax = subtotal * TAX_RATE;
      const shipping = subtotal > 0 ? SHIPPING_FLAT : 0;
      const total = subtotal + tax + shipping;

      if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
      if (taxEl) taxEl.textContent = `$${tax.toFixed(2)}`;
      if (shippingEl) shippingEl.textContent = `$${shipping.toFixed(2)}`;
      if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;

      updateBadge();
      renderPayPalButtons();
    }

    // + / – handlers in the table
    cartTableBody.addEventListener("click", (event) => {
      const minusBtn = event.target.closest(".cart-line-minus");
      const plusBtn  = event.target.closest(".cart-line-plus");
      if (!minusBtn && !plusBtn) return;

      const id = (minusBtn || plusBtn).dataset.id;
      const cart = getCart();

      if (plusBtn) {
        cart[id] = (cart[id] || 0) + 1;
      } else if (minusBtn) {
        cart[id] = (cart[id] || 0) - 1;
        if (cart[id] <= 0) {
          delete cart[id];
        }
      }

      saveCart(cart);
      renderCart();
    });

    // Clear cart button
    const clearBtn = document.getElementById("clearCartBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        localStorage.removeItem(CART_KEY);
        updateBadge();
        renderCart();
      });
    }

    // Initial render
    updateBadge();
    renderCart();
  });
});
