(function () {
  const storageKey = "vpQuoteCart";
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const quoteContext = document.querySelector("[data-product-quote-context]");
  const directProduct = quoteContext?.dataset.productQuoteDirect
    ? JSON.parse(quoteContext.dataset.productQuoteDirect)
    : null;
  let directItems = directProduct ? [{ ...directProduct, quantity: directProduct.quantity || 1 }] : null;

  function readCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item && slugPattern.test(item.slug) && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0)
        .map((item) => ({
          slug: item.slug,
          title: String(item.title || "Product"),
          category: String(item.category || ""),
          image: String(item.image || ""),
          quantity: Math.min(99, Number(item.quantity)),
        }));
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }

  function imagePath(value) {
    return value.startsWith("/images/") || value.startsWith("/uploads/")
      ? value
      : "/images/logo-mark.png";
  }

  function renderItems() {
    const cart = directItems || readCart();
    document.querySelectorAll("[data-product-cart-items]").forEach((container) => {
      container.replaceChildren();
      cart.forEach((item) => {
        const row = document.createElement("article");
        row.className = "product-cart-item";
        const image = document.createElement("img");
        image.src = imagePath(item.image);
        image.alt = "";
        const copy = document.createElement("div");
        copy.className = "product-cart-item-copy";
        const link = document.createElement("a");
        link.href = `/products/${encodeURIComponent(item.slug)}`;
        link.textContent = item.title;
        const category = document.createElement("small");
        category.textContent = item.category;
        copy.append(link, category);
        const quantity = document.createElement("label");
        quantity.className = "product-cart-quantity";
        quantity.append(document.createTextNode("Qty"));
        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = "99";
        input.value = item.quantity;
        input.setAttribute("aria-label", `Quantity for ${item.title}`);
        input.addEventListener("change", () => updateQuantity(item.slug, input.value));
        quantity.append(input);
        row.append(image, copy, quantity);
        if (!directItems) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "product-cart-remove";
          remove.textContent = "Remove";
          remove.addEventListener("click", () => removeItem(item.slug));
          row.append(remove);
        }
        container.append(row);
      });
    });
    document.querySelectorAll("[data-cart-empty]").forEach((element) => {
      element.hidden = cart.length > 0;
    });
    document.querySelectorAll("[data-cart-item-count]").forEach((element) => {
      element.textContent = cart.length ? `${cart.length} ${cart.length === 1 ? "item" : "items"}` : "No items";
    });
    document.querySelectorAll("#quoteCartCount").forEach((element) => {
      element.textContent = readCart().reduce((count, item) => count + item.quantity, 0);
    });
    document.querySelectorAll("[data-product-cart-json]").forEach((element) => {
      element.value = JSON.stringify(cart.map(({ slug, quantity }) => ({ slug, quantity })));
    });
    document.querySelectorAll("[data-submit-product-quote]").forEach((element) => {
      element.disabled = cart.length === 0;
    });
    const savedCart = readCart();
    document.querySelectorAll("[data-product-add]").forEach((button) => {
      const item = savedCart.find((entry) => entry.slug === button.dataset.productSlug);
      const selected = !!item;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", `${selected ? "Remove" : "Add"} ${button.dataset.productTitle || "product"} ${selected ? "from" : "to"} quote cart`);
      button.title = selected ? "Remove from quote cart" : "Add to quote cart";
      const quantity = button.closest(".product-card-cart-control")?.querySelector("[data-product-card-quantity]");
      if (quantity) {
        quantity.hidden = !selected;
        quantity.value = item?.quantity || 1;
      }
    });
  }

  function updateQuantity(slug, value) {
    const quantity = Math.max(1, Math.min(99, Number.parseInt(value, 10) || 1));
    const items = directItems || readCart();
    const updated = items.map((item) => item.slug === slug ? { ...item, quantity } : item);
    if (directItems) {
      directItems = updated;
      const form = document.querySelector("[data-product-checkout]");
      if (form) {
        const action = new URL(form.action, window.location.origin);
        action.searchParams.set("quantity", String(quantity));
        form.action = action.pathname + action.search;
      }
    }
    else if (!writeCart(updated)) showFeedback("Your browser could not save the quote cart. Check its storage settings.");
    renderItems();
  }

  function removeItem(slug) {
    if (!writeCart(readCart().filter((item) => item.slug !== slug))) {
      showFeedback("Your browser could not update the quote cart. Check its storage settings.");
    }
    renderItems();
  }

  function setCardQuantity(slug, value) {
    const quantity = Math.max(1, Math.min(99, Number.parseInt(value, 10) || 1));
    const updated = readCart().map((item) => item.slug === slug ? { ...item, quantity } : item);
    if (!writeCart(updated)) {
      showFeedback("Your browser could not update the quote cart. Check its storage settings.");
      return;
    }
    renderItems();
  }

  function showFeedback(message, source = null) {
    const card = source?.closest(".product-card");
    const feedback = card
      ? card.querySelectorAll("[data-product-feedback]")
      : document.querySelectorAll("[data-product-feedback]");
    feedback.forEach((element) => {
      element.textContent = message;
    });
  }

  document.querySelectorAll("[data-product-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = readCart();
      const slug = button.dataset.productSlug;
      if (button.closest(".product-card")) {
        const existing = current.some((item) => item.slug === slug);
        const updated = existing
          ? current.filter((item) => item.slug !== slug)
          : [...current, {
            slug,
            title: button.dataset.productTitle || "Product",
            image: button.dataset.productImage || "",
            category: button.dataset.productCategory || "",
            quantity: 1,
          }];
        if (!writeCart(updated)) {
          showFeedback("Your browser could not save the quote cart. Check its storage settings.", button);
          return;
        }
        showFeedback(
          `${button.dataset.productTitle || "Product"} ${existing ? "removed from" : "added to"} your quote cart.`,
          button
        );
        renderItems();
        return;
      }
      const quantityInput = document.querySelector("[data-product-quantity]");
      const amount = Math.max(1, Math.min(99, Number.parseInt(quantityInput?.value, 10) || 1));
      const existing = current.find((item) => item.slug === slug);
      const item = {
        slug,
        title: button.dataset.productTitle || "Product",
        image: button.dataset.productImage || "",
        category: button.dataset.productCategory || "",
        quantity: Math.min(99, amount + (existing?.quantity || 0)),
      };
      const updated = existing
        ? current.map((entry) => entry.slug === slug ? item : entry)
        : [...current, item];
      if (!writeCart(updated)) {
        showFeedback("Your browser could not save the quote cart. Check its storage settings.", button);
        return;
      }
      showFeedback(`${item.title} added to your quote cart.`, button);
      renderItems();
    });
  });
  document.querySelectorAll("[data-product-card-quantity]").forEach((input) => {
    input.addEventListener("change", () => setCardQuantity(input.dataset.productSlug, input.value));
  });

  document.querySelectorAll("[data-product-buy-now]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const quantityInput = document.querySelector("[data-product-quantity]");
      const quantity = Math.max(1, Math.min(99, Number.parseInt(quantityInput?.value, 10) || 1));
      const destination = new URL(link.href, window.location.origin);
      destination.searchParams.set("quantity", String(quantity));
      link.href = destination.pathname + destination.search;
      if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        window.location.assign(link.href);
      }
    });
  });

  if (quoteContext?.dataset.productQuoteSent === "true" && !directItems) writeCart([]);
  document.querySelectorAll("[data-product-checkout]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      if (!(directItems || readCart()).length) {
        event.preventDefault();
        showFeedback("Add at least one product before requesting a quote.");
      }
    });
  });
  renderItems();
})();
