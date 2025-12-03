window.addEventListener("DOMContentLoaded", () => {
  const CART_KEY = "magicMoonCart";
  const TAX_RATE = 0.08;      // 8% tax
  const SHIPPING_FLAT = 8.99; // flat shipping when there are items

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

    let paypalButtons = null;

    function calculateTotals() {
      const cart = getCart();
      let subtotal = 0;

      for (const [id, qty] of Object.entries(cart)) {
        const product = PRODUCT_DATA[id];
        if (!product) continue;
        const price = Number(product.price || 0);
        subtotal += price * (qty || 0);
      }

      const tax = subtotal * TAX_RATE;
      const shipping = subtotal > 0 ? SHIPPING_FLAT : 0;
      const total = subtotal + tax + shipping;

      return { subtotal, tax, shipping, total };
    }

    function renderPayPalButtons() {
      if (!paypalContainer || !window.paypal) return;

      const cart = getCart();
      const hasItems = Object.values(cart).some((qty) => qty > 0);

      // Clear previous buttons each time we re-render
      paypalContainer.innerHTML = "";

      if (!hasItems) return;

      paypalButtons = window.paypal.Buttons({
        createOrder: (data, actions) => {
          const { total } = calculateTotals();
          return actions.order.create({
            purchase_units: [
              {
                amount: {
                  value: total.toFixed(2)
                }
              }
            ]
          });
        },
        onApprove: (data, actions) => {
          return actions.order.capture().then(async (details) => {
            // Take a snapshot of the cart BEFORE clearing it
            const cartSnapshot = getCart();
            const { subtotal, tax, shipping, total } = calculateTotals();

            const items = Object.entries(cartSnapshot).map(([id, qty]) => {
              const product = PRODUCT_DATA[id] || {};
              return {
                id,
                name: product.name || id,
                qty,
                price: Number(product.price || 0)
              };
            });

            const orderData = {
              orderId: data.id || details.id,
              payerName:
                (details.payer?.name?.given_name || "") +
                " " +
                (details.payer?.name?.surname || ""),
              payerEmail: details.payer?.email_address || "",
              subtotal,
              tax,
              shipping,
              total,
              items
            };

            // 1) Log successful transaction to Firestore (for admin Recent Transactions)
            if (window.logSuccessfulTransaction) {
              try {
                await window.logSuccessfulTransaction(orderData);
              } catch (err) {
                console.error("Error logging order:", err);
              }
            }

            // 2) Update inventory in Firestore based on items bought
            if (window.updateInventoryAfterCheckout) {
              try {
                await window.updateInventoryAfterCheckout(cartSnapshot);
              } catch (err) {
                console.error("Error updating inventory after checkout:", err);
              }
            }

            alert(
              `Thank you, ${details.payer?.name?.given_name || "customer"}! Your payment is complete.`
            );

            // 3) Clear cart locally
            localStorage.removeItem(CART_KEY);
            updateBadge();
            renderCart();
          });
        },
        onError: (err) => {
          console.error("PayPal error:", err);
          alert("Something went wrong with PayPal. Please try again.");
        }
      });

      paypalButtons.render("#paypal-button-container");
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
        renderPayPalButtons(); // clears the button area
        return;
      }

      emptyCartState.classList.add("d-none");
      summaryCard.classList.remove("d-none");

      entries.forEach(([id, qty]) => {
        const product = PRODUCT_DATA[id];
        if (!product) return;

        const price = Number(product.price || 0);
        const lineTotal = price * qty;

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

      const totals = calculateTotals();
      if (subtotalEl) subtotalEl.textContent = `$${totals.subtotal.toFixed(2)}`;
      if (taxEl) taxEl.textContent = `$${totals.tax.toFixed(2)}`;
      if (shippingEl) {
        shippingEl.textContent =
          totals.subtotal > 0 ? `$${totals.shipping.toFixed(2)}` : "$0.00";
      }
      if (totalEl) totalEl.textContent = `$${totals.total.toFixed(2)}`;

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
