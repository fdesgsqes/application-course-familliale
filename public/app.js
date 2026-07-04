const state = {
  app: null,
  authMode: "login",
  invite: new URLSearchParams(location.search).get("invite"),
  editingItem: null,
  scanner: { active: false, stream: null, detector: null, timer: null, pending: null, target: "item" }
};

const categories = ["Frais", "Epicerie", "Boissons", "Surgeles", "Hygiene", "Maison", "Bebe", "Animal", "Autre"];
const units = ["", "piece", "kg", "g", "L", "ml", "paquet", "boite"];

const $ = (selector) => document.querySelector(selector);
const money = (value) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const dateLabel = (value) => {
  if (!value) return "Aucune date";
  const date = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};
const todayIso = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const isShoppingDay = (value) => Boolean(value && value === todayIso());

function inferCategory(name, fallback = "Autre") {
  const text = String(name || "").toLowerCase();
  const rules = [
    ["Frais", ["lait", "yaourt", "fromage", "beurre", "creme", "jambon", "oeuf", "salade", "tomate", "poulet", "viande", "poisson"]],
    ["Boissons", ["eau", "jus", "soda", "cafe", "the", "biere", "vin"]],
    ["Surgeles", ["surgele", "glace", "pizza surgelee"]],
    ["Hygiene", ["dentifrice", "savon", "shampoing", "gel douche", "deodorant", "papier toilette"]],
    ["Maison", ["lessive", "essuie-tout", "eponge", "produit vaisselle", "sac poubelle"]],
    ["Bebe", ["couche", "lingette", "biberon", "petit pot"]],
    ["Animal", ["croquette", "patee", "litiere"]]
  ];
  for (const [category, keywords] of rules) {
    if (keywords.some((keyword) => text.includes(keyword))) return category;
  }
  return fallback;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erreur inattendue.");
  return data;
}

function toast(message, type = "ok") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

async function refresh() {
  state.app = await api("/api/me");
  render();
}

function icon(name) {
  const icons = {
    plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
    trash: `<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/></svg>`,
    edit: `<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/></svg>`,
    copy: `<svg viewBox="0 0 24 24"><path d="M8 8h12v12H8zM4 16V4h12"/></svg>`,
    scan: `<svg viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10"/></svg>`,
    download: `<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>`,
    print: `<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 20 7.1l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.8 1z"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>`,
    clock: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    users: `<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.8M16 3.1a4 4 0 0 1 0 7.8"/></svg>`,
    archive: `<svg viewBox="0 0 24 24"><path d="M21 8H3l2-4h14l2 4zM5 8v12h14V8M10 12h4"/></svg>`
  };
  return icons[name] || "";
}

function authView() {
  const inviteNotice = state.invite
    ? `<div class="notice">Invitation detectee. Connecte-toi ou cree un compte, puis tu pourras rejoindre la famille.</div>`
    : "";
  const isRegister = state.authMode === "register";
  return `
    <main class="auth-shell">
      <section class="brand-panel">
        <div class="brand-mark">FC</div>
        <h1>Application Course</h1>
        <p>Une liste commune, un planning clair, des invitations securisees et les produits habituels toujours sous la main.</p>
        <div class="feature-strip">
          <span>Planning</span><span>Budget</span><span>Scan</span><span>Historique</span>
        </div>
      </section>
      <section class="auth-panel">
        ${inviteNotice}
        <div class="tabs">
          <button class="${!isRegister ? "active" : ""}" data-auth="login">Connexion</button>
          <button class="${isRegister ? "active" : ""}" data-auth="register">Creer un compte</button>
        </div>
        <form id="authForm" class="stack">
          ${isRegister ? `<label>Nom<input name="name" autocomplete="name" required minlength="2"></label>` : ""}
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Mot de passe<input name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" required minlength="${isRegister ? 8 : 1}"></label>
          ${isRegister && !state.invite ? `<label>Nom de la famille<input name="familyName" required minlength="2" placeholder="Famille Martin"></label>` : ""}
          <button class="primary wide" type="submit">${isRegister ? "Creer l'espace" : "Se connecter"}</button>
        </form>
      </section>
    </main>
  `;
}

function joinFamilyView() {
  return `
    <main class="auth-shell compact">
      <section class="auth-panel">
        <h1>Rejoindre la famille</h1>
        <p id="inviteInfo">Verification du lien...</p>
        <button class="primary wide" id="acceptInvite">Accepter l'invitation</button>
        <button class="ghost wide" id="logout">Changer de compte</button>
      </section>
    </main>
  `;
}

function appView() {
  const app = state.app;
  const total = app.items.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const checked = app.items.filter((item) => item.checked).length;
  const responsible = app.members.find((member) => member.id === app.list.responsibleUserId)?.name || "A definir";
  const grouped = categories.map((category) => [category, app.items.filter((item) => item.category === category)]).filter(([, items]) => items.length);
  const suggestions = [...new Set([...app.recurringItems.map((item) => item.name), ...app.trips.flatMap((trip) => trip.items.map((item) => item.name))])]
    .filter((name) => !app.items.some((item) => item.name.toLowerCase() === name.toLowerCase()))
    .slice(0, 8);

  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-row"><div class="brand-mark small">FC</div><div><strong>${app.family.name}</strong><span>${app.user.name}</span></div></div>
        <button class="ghost wide" id="logout">Deconnexion</button>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">Prochaines courses</p>
            <h1>${dateLabel(app.list.shoppingDate)}</h1>
            <span class="muted">Responsable : ${responsible}</span>
          </div>
          ${isShoppingDay(app.list.shoppingDate) ? `<button class="primary shopping-day-button" id="openShoppingList">${icon("check")} Liste du jour</button>` : ""}
          <div class="quick-stats">
            <div><strong>${checked}/${app.items.length}</strong><span>achetes</span></div>
            <div><strong>${money(total)}</strong><span>estime</span></div>
            <div><strong>${money(app.list.budget)}</strong><span>budget</span></div>
          </div>
        </header>

        <section class="layout">
          <div class="main-column">
            <section class="panel" id="liste">
              <div class="panel-head">
                <div><h2>Liste de courses</h2><p>${app.items.length ? "Tout le monde peut contribuer." : "Ajoute le premier produit."}</p></div>
                <div class="button-row">
                  <button class="icon-button" id="printList" title="Imprimer la liste">${icon("print")}</button>
                  <button class="icon-button" id="exportList" title="Exporter la liste">${icon("download")}</button>
                  <button class="icon-button" id="openScanner" title="Scanner un code-barres">${icon("scan")}</button>
                </div>
              </div>
              <form id="itemForm" class="item-form">
                <input name="name" placeholder="Produit" list="usualProducts" autocomplete="off" required>
                <datalist id="usualProducts">${app.recurringItems.map((item) => `<option value="${escapeAttr(item.name)}"></option>`).join("")}</datalist>
                <input name="quantity" placeholder="Qte" value="1">
                <select name="unit">${units.map((unit) => `<option>${unit}</option>`).join("")}</select>
                <select name="priority"><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="low">Pas urgent</option></select>
                <input name="note" placeholder="Note">
                <input name="category" type="hidden">
                <input name="barcode" type="hidden">
                <button class="primary" type="submit">${icon("plus")} Ajouter</button>
              </form>
              ${suggestions.length ? `<div class="chips">${suggestions.map((name) => `<button data-suggest="${escapeAttr(name)}">${name}</button>`).join("")}</div>` : ""}
              <div class="groups">
                ${grouped.length ? grouped.map(([category, items]) => `
                  <div class="group">
                    <h3>${category}</h3>
                    ${items.map(itemRow).join("")}
                  </div>
                `).join("") : `<div class="empty">La liste est vide pour le moment.</div>`}
              </div>
            </section>

            <section class="panel" id="historique">
              <div class="panel-head">
                <div><h2>Historique</h2><p>Archive une liste terminee ou recopie une ancienne course.</p></div>
                <button class="secondary" id="completeTrip">${icon("archive")} Archiver</button>
              </div>
              <div class="history">
                ${app.trips.length ? app.trips.map((trip) => `
                  <article class="history-row">
                    <div><strong>${dateLabel(trip.shoppingDate) || "Courses"}</strong><span>${trip.items.length} articles - ${money(trip.total)}</span></div>
                    <button class="ghost" data-duplicate="${trip.id}">${icon("copy")} Recopier</button>
                  </article>
                `).join("") : `<div class="empty">Aucune ancienne course.</div>`}
              </div>
            </section>
          </div>

          <div class="side-column">
            <section class="panel" id="planning">
              <h2>Planning</h2>
              <form id="planningForm" class="stack">
                <label>Titre<input name="title" value="${escapeAttr(app.list.title)}"></label>
                <label>Date des courses<input name="shoppingDate" type="date" value="${escapeAttr(app.list.shoppingDate || "")}"></label>
                <label>Responsable<select name="responsibleUserId"><option value="">A definir</option>${app.members.map((member) => `<option value="${member.id}" ${member.id === app.list.responsibleUserId ? "selected" : ""}>${member.name}</option>`).join("")}</select></label>
                <label>Budget estime<input name="budget" type="number" min="0" step="0.01" value="${Number(app.list.budget || 0)}"></label>
                <button class="primary wide" type="submit">${icon("check")} Enregistrer</button>
              </form>
            </section>

            <section class="panel">
              <div class="panel-head">
                <div><h2>Produits habituels</h2><p>Scanne ou ajoute les produits qui reviennent souvent.</p></div>
                <button class="icon-button" id="scanRecurring" title="Scanner un produit habituel">${icon("scan")}</button>
              </div>
              <form id="recurringForm" class="mini-form">
                <input name="name" placeholder="Produit" required>
                <input name="quantity" placeholder="Qte" value="1">
                <input name="category" type="hidden">
                <input name="barcode" type="hidden">
                <button class="icon-button" title="Ajouter">${icon("plus")}</button>
              </form>
              <button class="secondary wide" id="applyRecurring">Ajouter les habituels</button>
              <div class="mini-list">
                ${app.recurringItems.map((item) => `<span>${item.name}<button data-delete-rec="${item.id}">x</button></span>`).join("") || `<p class="muted">Aucun produit habituel.</p>`}
              </div>
            </section>

            <section class="panel" id="famille">
              <div class="panel-head">
                <div><h2>Famille</h2><p>${app.members.length} membre(s)</p></div>
                <button class="icon-button" id="createInvite" title="Creer un lien">${icon("users")}</button>
              </div>
              <div class="members">${app.members.map((member) => `<div><strong>${member.name}</strong><span>${member.role}</span></div>`).join("")}</div>
              <div class="invites">
                ${app.invitations.map(inviteRow).join("") || `<div class="empty">Aucun lien actif.</div>`}
              </div>
            </section>

            <section class="panel" id="parametres">
              <div class="panel-head">
                <div><h2>Parametres famille</h2><p>Nom, budget de depart et notes partagees.</p></div>
                <span class="role-pill">${app.membership.role}</span>
              </div>
              <form id="familySettingsForm" class="stack">
                <label>Nom de la famille<input name="name" value="${escapeAttr(app.family.name)}" ${app.membership.role !== "admin" ? "disabled" : ""}></label>
                <label>Magasin prefere<input name="preferredStore" value="${escapeAttr(app.family.settings?.preferredStore || "")}" placeholder="Marche, supermarche, drive..." ${app.membership.role !== "admin" ? "disabled" : ""}></label>
                <label>Budget par defaut<input name="defaultBudget" type="number" min="0" step="0.01" value="${Number(app.family.settings?.defaultBudget || 0)}" ${app.membership.role !== "admin" ? "disabled" : ""}></label>
                <label>Notes famille<textarea name="notes" rows="4" placeholder="Allergies, produits a eviter, preferences..." ${app.membership.role !== "admin" ? "disabled" : ""}>${escapeText(app.family.settings?.notes || "")}</textarea></label>
                <button class="primary wide" type="submit" ${app.membership.role !== "admin" ? "disabled" : ""}>${icon("settings")} Enregistrer les parametres</button>
              </form>
              ${app.membership.role !== "admin" ? `<p class="settings-note">Seul un administrateur peut modifier ces parametres.</p>` : ""}
            </section>

            <section class="panel">
              <h2>Activite</h2>
              <div class="activity">
                ${app.events.map((event) => `<div><span>${new Date(event.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>${event.message}</div>`).join("") || `<p class="muted">Rien a signaler.</p>`}
              </div>
            </section>
          </div>
        </section>
      </main>
      <div id="scannerModal" class="modal" hidden>${scannerView()}</div>
      <div id="shoppingModal" class="modal" hidden></div>
    </div>
  `;
}

function itemRow(item) {
  return `
    <article class="item ${item.checked ? "checked" : ""} ${item.priority === "urgent" ? "urgent" : ""}">
      <button class="check" data-toggle="${item.id}" aria-label="Cocher">${item.checked ? icon("check") : ""}</button>
      ${item.imageUrl ? `<img src="${escapeAttr(item.imageUrl)}" alt="">` : `<div class="product-placeholder">${item.name.slice(0, 1).toUpperCase()}</div>`}
      <div class="item-main">
        <strong>${item.name}</strong>
        <span>${[item.quantity, item.unit, item.note].filter(Boolean).join(" - ")} ${item.addedByName ? `par ${item.addedByName}` : ""}</span>
      </div>
      <div class="item-meta"><b>${money(item.price)}</b><small>${item.priority}</small></div>
      <button class="icon-button" data-edit="${item.id}" title="Modifier">${icon("edit")}</button>
      <button class="icon-button danger" data-delete="${item.id}" title="Supprimer">${icon("trash")}</button>
    </article>
  `;
}

function inviteRow(invite) {
  const link = `${location.origin}/?invite=${invite.token}`;
  return `
    <article class="invite ${invite.status}">
      <div><strong>${invite.status}</strong><span>Expire le ${new Date(invite.expiresAt).toLocaleDateString("fr-FR")}</span></div>
      <button class="ghost" data-copy="${escapeAttr(link)}">${icon("copy")} Copier</button>
      ${invite.status === "active" ? `<button class="icon-button danger" data-revoke="${invite.id}" title="Desactiver">${icon("trash")}</button>` : ""}
    </article>
  `;
}

function scannerView() {
  const targetLabel = state.scanner.target === "recurring" ? "un produit habituel" : "un produit";
  return `
    <div class="modal-card">
      <div class="panel-head"><div><h2>Scanner ${targetLabel}</h2><p>Place le code-barres dans le cadre, ou saisis-le a la main.</p></div><button class="icon-button" id="closeScanner">x</button></div>
      <video id="scannerVideo" autoplay playsinline muted></video>
      <form id="barcodeForm" class="item-form compact-form">
        <input name="barcode" placeholder="Code-barres manuel">
        <button class="primary">Rechercher</button>
      </form>
      <div id="scanResult" class="scan-result">Camera en cours de preparation...</div>
    </div>
  `;
}

function escapeAttr(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeText(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function render() {
  const root = $("#app");
  if (!state.app?.user) {
    root.innerHTML = authView();
    bindAuth();
    return;
  }
  if (state.invite && !state.app.family) {
    root.innerHTML = joinFamilyView();
    bindJoin();
    return;
  }
  if (state.invite && state.app.family) {
    root.innerHTML = joinFamilyView();
    $("#inviteInfo").textContent = "Ce compte appartient deja a une famille.";
    $("#acceptInvite").disabled = true;
    bindJoin();
    return;
  }
  root.innerHTML = appView();
  bindApp();
}

function bindAuth() {
  document.querySelectorAll("[data-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.auth;
      render();
    });
  });
  $("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const route = state.authMode === "register" ? "/api/register" : "/api/login";
      if (state.authMode === "register" && state.invite) form.inviteToken = state.invite;
      state.app = await api(route, { method: "POST", body: form });
      if (state.invite && state.authMode === "login") {
        await api(`/api/invitations/${state.invite}/accept`, { method: "POST" });
        history.replaceState(null, "", "/");
        state.invite = null;
        await refresh();
      } else if (state.invite && state.authMode === "register") {
        history.replaceState(null, "", "/");
        state.invite = null;
        render();
      } else {
        render();
      }
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

async function bindJoin() {
  try {
    const invite = await api(`/api/invitations/${state.invite}`);
    $("#inviteInfo").textContent = `Tu vas rejoindre ${invite.familyName}.`;
  } catch (error) {
    $("#inviteInfo").textContent = error.message;
    $("#acceptInvite").disabled = true;
  }
  $("#acceptInvite")?.addEventListener("click", async () => {
    try {
      state.app = await api(`/api/invitations/${state.invite}/accept`, { method: "POST" });
      history.replaceState(null, "", "/");
      state.invite = null;
      toast("Bienvenue dans la famille.");
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#logout")?.addEventListener("click", logout);
}

function formBody(form) {
  return Object.fromEntries(new FormData(form));
}

function enrichProductBody(body) {
  const usual = state.app.recurringItems.find((item) => item.name.toLowerCase() === String(body.name || "").trim().toLowerCase());
  return {
    ...body,
    quantity: body.quantity || usual?.quantity || "1",
    unit: body.unit || usual?.unit || "",
    category: usual?.category || inferCategory(body.name),
    note: body.note || usual?.note || "",
    imageUrl: body.imageUrl || usual?.imageUrl || "",
    barcode: body.barcode || usual?.barcode || ""
  };
}

function bindUsualProductHints(form) {
  const nameInput = form.querySelector("input[name='name']");
  if (!nameInput) return;
  nameInput.addEventListener("change", () => {
    const usual = state.app.recurringItems.find((item) => item.name.toLowerCase() === nameInput.value.trim().toLowerCase());
    if (!usual) return;
    const quantity = form.querySelector("input[name='quantity']");
    const note = form.querySelector("input[name='note']");
    const category = form.querySelector("input[name='category']");
    const barcode = form.querySelector("input[name='barcode']");
    if (quantity && (!quantity.value || quantity.value === "1")) quantity.value = usual.quantity || "1";
    if (note && !note.value) note.value = usual.note || "";
    if (category) category.value = usual.category || inferCategory(usual.name);
    if (barcode) barcode.value = usual.barcode || "";
  });
}

function bindApp() {
  $("#logout").addEventListener("click", logout);
  bindUsualProductHints($("#itemForm"));
  $("#itemForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      state.app = await api("/api/items", { method: "POST", body: enrichProductBody(formBody(event.currentTarget)) });
      toast("Produit ajoute.");
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#planningForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      state.app = await api("/api/list", { method: "PATCH", body: formBody(event.currentTarget) });
      toast("Planning enregistre.");
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#familySettingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      state.app = await api("/api/family", { method: "PATCH", body: formBody(event.currentTarget) });
      toast("Parametres famille enregistres.");
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  bindUsualProductHints($("#recurringForm"));
  $("#recurringForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = formBody(event.currentTarget);
      body.category = inferCategory(body.name);
      state.app = await api("/api/recurring", { method: "POST", body });
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#applyRecurring").addEventListener("click", mutate("/api/recurring/apply", "POST", "Produits habituels ajoutes."));
  $("#completeTrip").addEventListener("click", mutate("/api/trips/complete", "POST", "Liste archivee."));
  $("#exportList").addEventListener("click", exportList);
  $("#printList").addEventListener("click", printList);
  $("#openShoppingList")?.addEventListener("click", openShoppingList);
  $("#createInvite").addEventListener("click", async () => {
    try {
      const data = await api("/api/invitations", { method: "POST" });
      state.app = data.app;
      const link = `${location.origin}/?invite=${data.invite.token}`;
      await navigator.clipboard?.writeText(link).catch(() => {});
      toast("Lien d'invitation cree et copie si possible.");
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#openScanner").addEventListener("click", () => openScanner("item"));
  $("#scanRecurring").addEventListener("click", () => openScanner("recurring"));
  document.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", async () => {
    const item = state.app.items.find((entry) => entry.id === button.dataset.toggle);
    await patchItem(item.id, { checked: !item.checked });
  }));
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", mutate(`/api/items/${button.dataset.delete}`, "DELETE", "Produit supprime.")));
  document.querySelectorAll("[data-delete-rec]").forEach((button) => button.addEventListener("click", mutate(`/api/recurring/${button.dataset.deleteRec}`, "DELETE", "Produit habituel supprime.")));
  document.querySelectorAll("[data-revoke]").forEach((button) => button.addEventListener("click", mutate(`/api/invitations/${button.dataset.revoke}`, "DELETE", "Invitation desactivee.")));
  document.querySelectorAll("[data-duplicate]").forEach((button) => button.addEventListener("click", mutate(`/api/trips/${button.dataset.duplicate}/duplicate`, "POST", "Ancienne liste recopiee.")));
  document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    toast("Lien copie.");
  }));
  document.querySelectorAll("[data-suggest]").forEach((button) => button.addEventListener("click", async () => {
    await api("/api/items", { method: "POST", body: { name: button.dataset.suggest, quantity: "1", category: "Autre" } });
    await refresh();
  }));
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => editItem(button.dataset.edit)));
}

function mutate(path, method, message) {
  return async () => {
    try {
      state.app = await api(path, { method });
      toast(message);
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  };
}

async function patchItem(id, body) {
  try {
    state.app = await api(`/api/items/${id}`, { method: "PATCH", body });
    render();
  } catch (error) {
    toast(error.message, "error");
  }
}

function editItem(id) {
  const item = state.app.items.find((entry) => entry.id === id);
  const name = prompt("Nom du produit", item.name);
  if (!name) return;
  const quantity = prompt("Quantite", item.quantity) ?? item.quantity;
  const price = prompt("Prix estime", item.price) ?? item.price;
  patchItem(id, { name, quantity, price });
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportList() {
  const app = state.app;
  const rows = [
    ["Produit", "Quantite", "Unite", "Categorie", "Priorite", "Prix", "Note", "Code-barres", "Achete"],
    ...app.items.map((item) => [
      item.name,
      item.quantity,
      item.unit,
      item.category,
      item.priority,
      item.price,
      item.note,
      item.barcode,
      item.checked ? "Oui" : "Non"
    ])
  ];
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `liste-courses-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Liste exportee.");
}

function printList() {
  const app = state.app;
  const grouped = categories
    .map((category) => [category, app.items.filter((item) => item.category === category)])
    .filter(([, items]) => items.length);
  const total = app.items.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) {
    toast("Impossible d'ouvrir l'impression.", "error");
    return;
  }
  win.document.write(`
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>${escapeText(app.list.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #17201b; }
          header { border-bottom: 2px solid #17201b; margin-bottom: 22px; padding-bottom: 14px; }
          h1 { margin: 0 0 8px; font-size: 30px; }
          h2 { margin: 22px 0 8px; font-size: 16px; text-transform: uppercase; }
          .meta { color: #66706a; }
          .row { display: grid; grid-template-columns: 28px 1fr 90px 90px; gap: 10px; padding: 9px 0; border-bottom: 1px solid #dfe4dc; align-items: center; }
          .box { width: 18px; height: 18px; border: 1px solid #17201b; display: inline-block; }
          .done { text-decoration: line-through; color: #66706a; }
          footer { margin-top: 24px; font-weight: bold; }
          @media print { button { display: none; } body { margin: 18mm; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Imprimer</button>
        <header>
          <h1>${escapeText(app.list.title)}</h1>
          <div class="meta">${escapeText(app.family.name)} - ${dateLabel(app.list.shoppingDate)} - Budget ${money(app.list.budget)}</div>
        </header>
        ${grouped.map(([category, items]) => `
          <section>
            <h2>${escapeText(category)}</h2>
            ${items.map((item) => `
              <div class="row">
                <span class="box">${item.checked ? "X" : ""}</span>
                <strong class="${item.checked ? "done" : ""}">${escapeText(item.name)}${item.note ? ` <span class="meta">- ${escapeText(item.note)}</span>` : ""}</strong>
                <span>${escapeText([item.quantity, item.unit].filter(Boolean).join(" "))}</span>
                <span>${money(item.price)}</span>
              </div>
            `).join("")}
          </section>
        `).join("") || `<p>Aucun produit dans la liste.</p>`}
        <footer>Total estime : ${money(total)}</footer>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
}

function shoppingListView() {
  const app = state.app;
  const grouped = categories
    .map((category) => [category, app.items.filter((item) => item.category === category)])
    .filter(([, items]) => items.length);
  return `
    <div class="modal-card shopping-card">
      <div class="panel-head">
        <div><h2>Liste du jour</h2><p>${dateLabel(app.list.shoppingDate)} - ${app.items.length} produit(s)</p></div>
        <button class="icon-button" id="closeShoppingList">x</button>
      </div>
      <div class="shopping-groups">
        ${grouped.map(([category, items]) => `
          <section>
            <h3>${category}</h3>
            ${items.map((item) => `
              <label class="shopping-item ${item.checked ? "checked" : ""}">
                <input type="checkbox" data-shopping-toggle="${item.id}" ${item.checked ? "checked" : ""}>
                <span>${escapeText(item.name)}</span>
                <small>${escapeText([item.quantity, item.unit, item.note].filter(Boolean).join(" - "))}</small>
              </label>
            `).join("")}
          </section>
        `).join("") || `<div class="empty">Aucun produit pour aujourd'hui.</div>`}
      </div>
      <div class="button-row">
        <button class="secondary" id="printListFromShopping">${icon("print")} Imprimer</button>
        <button class="primary" id="completeTripFromShopping">${icon("archive")} Archiver la liste</button>
      </div>
    </div>
  `;
}

function openShoppingList() {
  const modal = $("#shoppingModal");
  modal.innerHTML = shoppingListView();
  modal.hidden = false;
  $("#closeShoppingList").addEventListener("click", () => {
    modal.hidden = true;
  });
  $("#printListFromShopping").addEventListener("click", printList);
  $("#completeTripFromShopping").addEventListener("click", mutate("/api/trips/complete", "POST", "Liste archivee."));
  document.querySelectorAll("[data-shopping-toggle]").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        state.app = await api(`/api/items/${input.dataset.shoppingToggle}`, { method: "PATCH", body: { checked: input.checked } });
        render();
        openShoppingList();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  });
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.app = { user: null };
  render();
}

async function openScanner(target = "item") {
  state.scanner.target = target;
  $("#scannerModal").hidden = false;
  $("#scannerModal").innerHTML = scannerView();
  $("#closeScanner").addEventListener("click", closeScanner);
  $("#barcodeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const barcode = new FormData(event.currentTarget).get("barcode");
    await lookupBarcode(barcode);
  });
  $("#scanResult").addEventListener("click", async (event) => {
    const action = event.target.closest("[data-scan-action]")?.dataset.scanAction;
    if (!action) return;
    if (action === "add") await addScannedProduct();
    if (action === "manual") {
      const code = state.scanner.pending?.barcode || "";
      const productName = state.scanner.pending?.name || "";
      const formSelector = state.scanner.target === "recurring" ? "#recurringForm" : "#itemForm";
      closeScanner();
      const barcodeInput = document.querySelector(`${formSelector} input[name='barcode']`);
      if (barcodeInput) barcodeInput.value = code;
      const nameInput = document.querySelector(`${formSelector} input[name='name']`);
      if (productName && nameInput && !nameInput.value) nameInput.value = productName;
      nameInput?.focus();
    }
    if (action === "rescan") {
      state.scanner.pending = null;
      $("#scanResult").textContent = "Tu peux scanner un autre code.";
      startBarcodeLoop();
    }
  });
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    $("#scanResult").textContent = "Scanner automatique indisponible ici. Tu peux saisir le code manuellement.";
    return;
  }
  try {
    state.scanner.detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    state.scanner.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = $("#scannerVideo");
    video.srcObject = state.scanner.stream;
    $("#scanResult").textContent = "Camera prete. Recherche d'un code-barres...";
    startBarcodeLoop();
  } catch {
    $("#scanResult").textContent = "Camera non disponible. Saisie manuelle possible.";
  }
}

function startBarcodeLoop() {
  clearInterval(state.scanner.timer);
  const video = $("#scannerVideo");
  if (!video || !state.scanner.detector) return;
  state.scanner.timer = setInterval(async () => {
    try {
      const codes = await state.scanner.detector.detect(video);
      if (codes[0]?.rawValue) {
        clearInterval(state.scanner.timer);
        await lookupBarcode(codes[0].rawValue);
      }
    } catch {}
  }, 650);
}

function closeScanner() {
  clearInterval(state.scanner.timer);
  state.scanner.stream?.getTracks().forEach((track) => track.stop());
  state.scanner = { active: false, stream: null, detector: null, timer: null, pending: null, target: "item" };
  $("#scannerModal").hidden = true;
}

async function lookupBarcode(barcode) {
  const code = String(barcode || "").trim();
  if (!code) return;
  clearInterval(state.scanner.timer);
  const source = state.scanner.target === "recurring" ? state.app.recurringItems : state.app.items;
  const existing = source.find((item) => item.barcode === code);
  if (existing) {
    state.scanner.pending = { barcode: code };
    $("#scanResult").innerHTML = `
      <div class="scan-card">
        <strong>Deja dans la liste</strong>
        <span>${escapeText(existing.name)} est deja present ${state.scanner.target === "recurring" ? "dans les habituels" : "dans la liste"}.</span>
        <div class="button-row">
          <button class="secondary" data-scan-action="rescan" type="button">Scanner autre chose</button>
          <button class="ghost" data-scan-action="manual" type="button">Ajouter quand meme</button>
        </div>
      </div>
    `;
    return;
  }
  $("#scanResult").textContent = "Recherche du produit...";
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    const data = await response.json();
    if (!data.product) throw new Error("Produit non trouve.");
    const product = data.product;
    state.scanner.pending = {
      name: product.product_name || product.generic_name || `Produit ${code}`,
      quantity: product.quantity || "1",
      category: productCategory(product) || inferCategory(product.product_name || product.generic_name || `Produit ${code}`),
      note: [product.brands, product.nutriscore_grade ? `Nutri-Score ${product.nutriscore_grade.toUpperCase()}` : ""].filter(Boolean).join(" - "),
      imageUrl: product.image_front_small_url || product.image_url || "",
      barcode: code
    };
    $("#scanResult").innerHTML = `
      <div class="scan-card">
        ${state.scanner.pending.imageUrl ? `<img src="${escapeAttr(state.scanner.pending.imageUrl)}" alt="">` : `<div class="product-placeholder">${escapeText(state.scanner.pending.name.slice(0, 1).toUpperCase())}</div>`}
        <div>
          <strong>${escapeText(state.scanner.pending.name)}</strong>
          <span>${escapeText([state.scanner.pending.quantity, state.scanner.pending.note].filter(Boolean).join(" - "))}</span>
          <small>Code ${escapeText(code)} - ${escapeText(state.scanner.pending.category)}</small>
        </div>
        <div class="button-row">
          <button class="primary" data-scan-action="add" type="button">${icon("plus")} ${state.scanner.target === "recurring" ? "Ajouter aux habituels" : "Ajouter"}</button>
          <button class="ghost" data-scan-action="rescan" type="button">Rescanner</button>
        </div>
      </div>
    `;
  } catch (error) {
    state.scanner.pending = { barcode: code };
    $("#scanResult").innerHTML = `
      <div class="scan-card">
        <strong>Produit introuvable</strong>
        <span>Tu peux l'ajouter manuellement avec le code ${escapeText(code)}.</span>
        <div class="button-row">
          <button class="secondary" data-scan-action="manual" type="button">Saisie manuelle</button>
          <button class="ghost" data-scan-action="rescan" type="button">Rescanner</button>
        </div>
      </div>
    `;
  }
}

function productCategory(product) {
  const text = [
    product.categories,
    ...(product.categories_tags || []),
    product.compared_to_category
  ].join(" ").toLowerCase();
  if (text.includes("beverage") || text.includes("boisson")) return "Boissons";
  if (text.includes("frozen") || text.includes("surgele")) return "Surgeles";
  if (text.includes("dairy") || text.includes("cheese") || text.includes("fresh") || text.includes("frais")) return "Frais";
  if (text.includes("baby") || text.includes("bebe")) return "Bebe";
  if (text.includes("hygiene") || text.includes("cosmetic")) return "Hygiene";
  if (text.includes("pet-food") || text.includes("animal")) return "Animal";
  return "Epicerie";
}

async function addScannedProduct() {
  const body = state.scanner.pending;
  if (!body?.name) return;
  try {
    const route = state.scanner.target === "recurring" ? "/api/recurring" : "/api/items";
    state.app = await api(route, { method: "POST", body });
    toast(state.scanner.target === "recurring" ? "Produit habituel scanne ajoute." : "Produit scanne ajoute.");
    closeScanner();
    render();
  } catch (error) {
    toast(error.message, "error");
  }
}

refresh().catch((error) => {
  document.body.innerHTML = `<pre>${error.message}</pre>`;
});
