(function () {
  "use strict";

  const data = window.NY_DATA || { categories: [], hotel: null };
  const app = document.getElementById("app");
  const crumbs = document.getElementById("crumbs");

  const menuBtn = document.getElementById("menu-btn");
  const drawer = document.getElementById("drawer");
  const drawerList = document.getElementById("drawer-list");

  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modal-title");
  const modalSub = document.getElementById("modal-sub");
  const modalMeta = document.getElementById("modal-meta");
  const modalDesc = document.getElementById("modal-desc");
  const modalImage = document.getElementById("modal-image");
  let lastFocus = null;

  /* ---------- location state ---------- */
  // mode: "me" | "hotel" | "pending"
  const origin = {
    mode: data.hotel ? "hotel" : "pending",
    lat: data.hotel ? data.hotel.lat : null,
    lon: data.hotel ? data.hotel.lon : null,
    label: data.hotel ? data.hotel.name : "",
    userAvailable: false  // whether we have a recent fix
  };

  function setOrigin(mode) {
    if (mode === "me" && origin.userAvailable) {
      origin.mode = "me";
      origin.lat = origin._userLat;
      origin.lon = origin._userLon;
      origin.label = "your location";
    } else if (data.hotel) {
      origin.mode = "hotel";
      origin.lat = data.hotel.lat;
      origin.lon = data.hotel.lon;
      origin.label = data.hotel.name;
    }
    render();
  }

  function requestUserLocation() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        origin._userLat = pos.coords.latitude;
        origin._userLon = pos.coords.longitude;
        origin.userAvailable = true;
        setOrigin("me");
      },
      () => {
        // denied / unavailable / timeout — keep hotel fallback
        origin.userAvailable = false;
        render();
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }

  function haversineKm(aLat, aLon, bLat, bLon) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function mapsUrlFor(item) {
    if (!item) return null;
    if (item.mapsUrl) return item.mapsUrl;
    // Prefer a clean name-based search — Google's top result is almost
    // always the official place card for famous spots. Fall back to coords.
    const q = item.mapsQuery || item.name;
    if (q) {
      const hasCity = /\b(?:new york|nyc|brooklyn|queens|manhattan|bronx|harlem|astoria|soho|dumbo|williamsburg|bushwick|greenpoint|tribeca|chelsea|chinatown|inwood|hudson yards|midtown|downtown)\b/i.test(q);
      const full = hasCity ? q : q + ", New York";
      return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(full);
    }
    if (typeof item.lat === "number" && typeof item.lon === "number") {
      return "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(item.lat.toFixed(6) + "," + item.lon.toFixed(6));
    }
    return null;
  }

  const PIN_SVG =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 22s-7-7.58-7-12a7 7 0 1 1 14 0c0 4.42-7 12-7 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="1.6"/>' +
    "</svg>";

  const HEART_OUTLINE =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 20s-7-4.35-7-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 19 10c0 5.65-7 10-7 10Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>' +
    "</svg>";
  const HEART_FILLED =
    '<svg aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 20s-7-4.35-7-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 19 10c0 5.65-7 10-7 10Z" fill="currentColor"/>' +
    "</svg>";

  /* ---------- favourites store ---------- */
  const MAX_FAVOURITES = 150;
  const favStore = {
    set: new Set(),
    load() {
      try {
        const arr = JSON.parse(localStorage.getItem("ny-favs"));
        if (Array.isArray(arr)) arr.forEach((k) => this.set.add(k));
      } catch (_) {}
    },
    save() {
      try { localStorage.setItem("ny-favs", JSON.stringify([...this.set])); } catch (_) {}
    },
    key(catId, itemId) { return catId + ":" + itemId; },
    has(catId, itemId) { return this.set.has(this.key(catId, itemId)); },
    count() { return this.set.size; },
    isFull() { return this.set.size >= MAX_FAVOURITES; },
    toggle(catId, itemId) {
      const k = this.key(catId, itemId);
      if (this.set.has(k)) {
        this.set.delete(k);
        this.save();
        return { added: false };
      }
      if (this.set.size >= MAX_FAVOURITES) {
        return { added: false, capped: true };
      }
      this.set.add(k);
      this.save();
      return { added: true };
    }
  };
  favStore.load();

  function gatherFavourites() {
    const items = [];
    for (const cat of data.categories) {
      if (cat.id === "favourites") continue;
      for (const it of cat.items) {
        if (favStore.has(cat.id, it.id)) {
          items.push(Object.assign({}, it, {
            _sourceCatId: cat.id,
            _sourceCatName: cat.name
          }));
        }
      }
    }
    return items;
  }

  function formatDistance(km) {
    if (km == null || !isFinite(km)) return "";
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
  }

  function distanceFor(item) {
    if (!item || typeof item.lat !== "number" || typeof item.lon !== "number") return null;
    if (origin.lat == null || origin.lon == null) return null;
    return haversineKm(origin.lat, origin.lon, item.lat, item.lon);
  }

  /* ---------- sort state ---------- */
  const sortState = (function () {
    try {
      const stored = JSON.parse(localStorage.getItem("ny-sort"));
      if (stored && ["curated", "distance", "rating"].includes(stored.by)) {
        return { by: stored.by, direction: stored.direction === "desc" ? "desc" : "asc" };
      }
    } catch (_) {}
    return { by: "curated", direction: "asc" };
  })();

  function setSort(by) {
    if (sortState.by === by) {
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    } else {
      sortState.by = by;
      sortState.direction = by === "rating" ? "desc" : "asc";
    }
    try { localStorage.setItem("ny-sort", JSON.stringify(sortState)); } catch (_) {}
    render();
  }

  function sortItems(items) {
    if (sortState.by === "curated") return items;
    const arr = items.slice();
    if (sortState.by === "distance") {
      arr.sort((a, b) => {
        const da = distanceFor(a);
        const db = distanceFor(b);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return sortState.direction === "asc" ? da - db : db - da;
      });
    } else if (sortState.by === "rating") {
      arr.sort((a, b) => {
        const ra = typeof a.rating === "number" ? a.rating : null;
        const rb = typeof b.rating === "number" ? b.rating : null;
        if (ra == null && rb == null) return 0;
        if (ra == null) return 1;
        if (rb == null) return -1;
        return sortState.direction === "asc" ? ra - rb : rb - ra;
      });
    }
    return arr;
  }

  function sortBarHTML() {
    const active = (k) => (sortState.by === k ? " is-active" : "");
    const distLabel = sortState.by === "distance"
      ? (sortState.direction === "asc" ? "Nearest" : "Farthest")
      : "By distance";
    const ratingLabel = sortState.by === "rating"
      ? (sortState.direction === "desc" ? "Best rated" : "Lowest rated")
      : "By rating";
    const arrow = (k) => sortState.by === k ? (sortState.direction === "asc" ? " ↑" : " ↓") : "";
    return `
      <div class="sort-bar" role="group" aria-label="Sort items">
        <button type="button" class="sort-pill${active("curated")}" data-sort="curated">Curated</button>
        <button type="button" class="sort-pill${active("distance")}" data-sort="distance">${distLabel}${arrow("distance")}</button>
        <button type="button" class="sort-pill${active("rating")}" data-sort="rating">${ratingLabel}${arrow("rating")}</button>
      </div>`;
  }

  function flashToast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("is-show"));
    setTimeout(() => {
      t.classList.remove("is-show");
      setTimeout(() => t.remove(), 280);
    }, 2200);
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function findCategory(id) {
    const cat = data.categories.find((c) => c.id === id);
    if (cat && cat.id === "favourites") {
      // Populate at render time from all saved favourites.
      return Object.assign({}, cat, { items: gatherFavourites() });
    }
    return cat;
  }
  function findItem(cat, id) {
    return cat && cat.items.find((i) => i.id === id);
  }

  /* ---------- routing ---------- */
  function parseHash() {
    const h = (location.hash || "#/").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);
    return { cat: parts[0] || null, item: parts[1] || null };
  }

  function render() {
    const route = parseHash();
    renderDrawerList(route.cat);
    if (!route.cat) {
      renderHome();
      setCrumbs([]);
      closeModal();
      return;
    }
    const cat = findCategory(route.cat);
    if (!cat) {
      renderHome();
      setCrumbs([]);
      return;
    }
    renderCategory(cat);
    setCrumbs([{ href: "#/", label: "Home" }, { label: cat.name }]);

    if (route.item) {
      const item = findItem(cat, route.item);
      if (item) openModal(cat, item);
      else closeModal();
    } else {
      closeModal();
    }
  }

  /* ---------- drawer ---------- */
  function renderDrawerList(activeId) {
    drawerList.innerHTML = data.categories
      .map((c, i) => {
        const active = c.id === activeId ? " is-active" : "";
        return `
          <li>
            <a class="${active.trim()}" href="#/${encodeURIComponent(c.id)}" data-drawer-link>
              <span class="dnum">${String(i + 1).padStart(2, "0")}</span>
              <span>${escapeHTML(c.name)}</span>
              <span class="dcount">${c.id === "favourites" ? favStore.count() : c.items.length}</span>
            </a>
          </li>`;
      })
      .join("");
  }

  function openDrawer() {
    drawer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    menuBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    const panel = drawer.querySelector(".drawer-panel");
    setTimeout(() => panel && panel.focus(), 0);
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
    menuBtn.setAttribute("aria-expanded", "false");
    if (modal.hidden) document.body.style.overflow = "";
  }
  menuBtn.addEventListener("click", () => {
    drawer.hidden ? openDrawer() : closeDrawer();
  });
  drawer.addEventListener("click", (e) => {
    if (e.target.matches("[data-close-drawer]")) closeDrawer();
    if (e.target.closest("[data-drawer-link]")) closeDrawer();
  });

  /* ---------- origin chip ---------- */
  function originChipHTML() {
    const isMe = origin.mode === "me";
    const dot = `<span class="dot ${isMe ? "live" : ""}"></span>`;
    const label = isMe ? "From your location" : `From ${escapeHTML(origin.label)}`;
    const action = origin.userAvailable
      ? `<button type="button" class="chip-toggle" data-origin-toggle>${isMe ? "use hotel" : "use my location"}</button>`
      : `<button type="button" class="chip-toggle" data-origin-locate>locate me</button>`;
    return `<div class="origin-chip" role="status" aria-live="polite">${dot}<span class="chip-label">${label}</span>${action}</div>`;
  }

  document.addEventListener("click", (e) => {
    if (e.target.matches("[data-origin-toggle]")) {
      setOrigin(origin.mode === "me" ? "hotel" : "me");
    } else if (e.target.matches("[data-origin-locate]")) {
      requestUserLocation();
    }
  });

  /* ---------- views ---------- */
  function renderHome() {
    const cards = data.categories
      .map(
        (c, i) => {
          const n = c.id === "favourites" ? favStore.count() : c.items.length;
          return `
          <a class="cat-card" href="#/${encodeURIComponent(c.id)}">
            <div class="num">${String(i + 1).padStart(2, "0")}</div>
            <h2>${escapeHTML(c.name)}</h2>
            <div class="count">${n} location${n === 1 ? "" : "s"}</div>
          </a>`;
        }
      )
      .join("");

    app.innerHTML = `
      <section class="intro">
        <h1>New York</h1>
        <p>A small guide for our visit. Pick a category, tap the <em>i</em> on any item for the full story and details to read on the plane.</p>
        ${originChipHTML()}
      </section>
      <section class="grid">${cards}</section>
    `;
  }

  function renderCategory(cat) {
    const items = sortItems(cat.items);
    const rows = items
      .map((it, i) => {
        const km = distanceFor(it);
        const dist = km != null ? `<span class="dist">${formatDistance(km)}</span>` : "";
        const rating = typeof it.rating === "number"
          ? `<span class="rating">★ ${it.rating.toFixed(1)}</span>` : "";
        const sourceCat = it._sourceCatId || cat.id;
        const sourceCatName = it._sourceCatName || cat.name;
        const sourceTag = cat.id === "favourites" && it._sourceCatName
          ? `<span class="src">${escapeHTML(it._sourceCatName)}</span>` : "";
        const isFav = favStore.has(sourceCat, it.id);
        const heartBtn = `<button class="heart-btn${isFav ? " is-on" : ""}" type="button" data-fav-cat="${escapeHTML(sourceCat)}" data-fav-item="${escapeHTML(it.id)}" aria-label="${isFav ? "Remove from" : "Add to"} favourites" aria-pressed="${isFav ? "true" : "false"}">${isFav ? HEART_FILLED : HEART_OUTLINE}</button>`;
        const maps = mapsUrlFor(it);
        const mapBtn = maps
          ? `<a class="map-btn" href="${escapeHTML(maps)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(it.name)} in Google Maps">${PIN_SVG}</a>`
          : "";
        return `
          <li>
            <span class="idx">${String(i + 1).padStart(2, "0")}</span>
            <div class="item-body">
              <span class="item-name">${escapeHTML(it.name)}</span>
              <span class="item-sub-row">
                ${it.subtitle ? `<span class="item-sub">${escapeHTML(it.subtitle)}</span>` : ""}
                ${sourceTag}
                ${rating}
                ${dist}
              </span>
            </div>
            <div class="row-actions">
              ${heartBtn}
              ${mapBtn}
              <button class="info-btn" type="button" data-item="${escapeHTML(it.id)}" aria-label="More info about ${escapeHTML(it.name)}">i</button>
            </div>
          </li>`;
      })
      .join("");

    app.innerHTML = `
      <section class="cat-head">
        <h1>${escapeHTML(cat.name)}</h1>
        <div class="count">${cat.items.length} location${cat.items.length === 1 ? "" : "s"}</div>
      </section>
      ${originChipHTML()}
      ${cat.items.length > 0 ? sortBarHTML() : ""}
      ${
        cat.items.length === 0
          ? (cat.id === "favourites"
              ? `<div class="empty">No favourites yet. Tap the ♥ on any item to save it here. They'll persist across sessions, and you can sort them by distance or rating like any other list.</div>`
              : `<div class="empty">No items yet. Items will be added here, with image, distance from ${escapeHTML(origin.label)} (or your location when online), and an <em>i</em> for the full description.</div>`)
          : `<ol class="list">${rows}</ol>`
      }
    `;

    app.querySelectorAll(".info-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const itemId = btn.getAttribute("data-item");
        location.hash = `#/${encodeURIComponent(cat.id)}/${encodeURIComponent(itemId)}`;
      });
    });

    app.querySelectorAll(".sort-pill").forEach((btn) => {
      btn.addEventListener("click", () => setSort(btn.getAttribute("data-sort")));
    });

    app.querySelectorAll(".heart-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fc = btn.getAttribute("data-fav-cat");
        const fi = btn.getAttribute("data-fav-item");
        const res = favStore.toggle(fc, fi);
        if (res.capped) flashToast("Favourites are full (" + MAX_FAVOURITES + "). Remove one first.");
        render();
      });
    });
  }

  function setCrumbs(trail) {
    if (!trail.length) {
      crumbs.innerHTML = "";
      return;
    }
    crumbs.innerHTML = trail
      .map((c, i) => {
        const sep = i > 0 ? `<span class="sep">/</span>` : "";
        const node = c.href
          ? `<a href="${c.href}">${escapeHTML(c.label)}</a>`
          : `<span>${escapeHTML(c.label)}</span>`;
        return sep + node;
      })
      .join(" ");
  }

  /* ---------- modal ---------- */
  function openModal(cat, item) {
    lastFocus = document.activeElement;

    modalTitle.textContent = item.name || "";
    modalSub.textContent = item.subtitle || "";

    // Favourites heart in the modal.
    const heart = document.getElementById("modal-heart");
    if (heart) {
      const favCat = item._sourceCatId || cat.id;
      const favItem = item.id;
      const isFav = favStore.has(favCat, favItem);
      heart.innerHTML = isFav ? HEART_FILLED : HEART_OUTLINE;
      heart.classList.toggle("is-on", isFav);
      heart.setAttribute("aria-pressed", isFav ? "true" : "false");
      heart.setAttribute("aria-label", (isFav ? "Remove from" : "Add to") + " favourites");
      heart.dataset.favCat = favCat;
      heart.dataset.favItem = favItem;
    }

    const figure = modalImage.parentElement;
    figure.style.display = "";
    figure.classList.remove("is-empty");
    figure.dataset.label = item.name || "";
    if (item.image) {
      modalImage.style.display = "";
      modalImage.onerror = () => {
        modalImage.style.display = "none";
        figure.classList.add("is-empty");
      };
      modalImage.onload = () => {
        modalImage.style.display = "";
        figure.classList.remove("is-empty");
      };
      modalImage.src = item.image;
      modalImage.alt = item.name || "";
    } else {
      modalImage.onerror = null;
      modalImage.onload = null;
      modalImage.removeAttribute("src");
      modalImage.alt = "";
      modalImage.style.display = "none";
      figure.classList.add("is-empty");
    }

    const metaRows = [];
    const km = distanceFor(item);
    if (km != null) {
      metaRows.push([
        "Distance",
        `${escapeHTML(formatDistance(km))} <span class="muted-inline">from ${escapeHTML(origin.label)}</span>`
      ]);
    }
    if (item.address) metaRows.push(["Address", escapeHTML(item.address)]);
    const maps = mapsUrlFor(item);
    if (maps) {
      metaRows.push([
        "Map",
        `<a class="maps-link" href="${escapeHTML(maps)}" target="_blank" rel="noopener noreferrer">${PIN_SVG}<span>Open in Google Maps</span></a>`
      ]);
    }
    if (item.hours) metaRows.push(["Hours", escapeHTML(item.hours)]);
    if (item.price) metaRows.push(["Price", escapeHTML(item.price)]);
    if (item.website) {
      const href = escapeHTML(item.website);
      metaRows.push(["Website", `<a href="${href}" target="_blank" rel="noopener noreferrer">${href.replace(/^https?:\/\//, "")}</a>`]);
    }
    modalMeta.innerHTML = metaRows.length
      ? metaRows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")
      : "";
    modalMeta.style.display = metaRows.length ? "" : "none";

    modalDesc.textContent = item.description || "";

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    const panel = modal.querySelector(".modal-panel");
    setTimeout(() => panel && panel.focus(), 0);
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function backToCategory() {
    const route = parseHash();
    if (route.cat) location.hash = `#/${encodeURIComponent(route.cat)}`;
    else location.hash = "#/";
  }

  modal.addEventListener("click", (e) => {
    if (e.target.matches("[data-close]")) backToCategory();
    const heart = e.target.closest("#modal-heart");
    if (heart) {
      e.preventDefault();
      e.stopPropagation();
      const fc = heart.dataset.favCat;
      const fi = heart.dataset.favItem;
      if (fc && fi) {
        const res = favStore.toggle(fc, fi);
        if (res.capped) flashToast("Favourites are full (" + MAX_FAVOURITES + "). Remove one first.");
        const isFav = favStore.has(fc, fi);
        heart.innerHTML = isFav ? HEART_FILLED : HEART_OUTLINE;
        heart.classList.toggle("is-on", isFav);
        heart.setAttribute("aria-pressed", isFav ? "true" : "false");
        heart.setAttribute("aria-label", (isFav ? "Remove from" : "Add to") + " favourites");
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal.hidden) backToCategory();
    else if (!drawer.hidden) closeDrawer();
  });

  window.addEventListener("hashchange", render);

  /* ---------- service worker (offline) ----------
   * Flip ENABLE_OFFLINE to true when content is finished, so the app
   * caches everything for the plane. While building, keep it false:
   * the registration below actively unregisters any old worker and
   * clears its caches, so refreshes always show the latest edits.
   */
  const ENABLE_OFFLINE = false;

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;

    if (!ENABLE_OFFLINE) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      if (window.caches && caches.keys) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((reg) => {
          const imgs = [];
          (data.categories || []).forEach((c) =>
            (c.items || []).forEach((it) => {
              if (it.image) imgs.push(it.image);
            })
          );
          const target = reg.active || navigator.serviceWorker.controller;
          if (imgs.length && target) {
            target.postMessage({ type: "precache-images", urls: imgs });
          }
        })
        .catch(() => {});
    });
  }
  registerSW();

  /* ---------- boot ---------- */
  render();
  requestUserLocation();
})();
