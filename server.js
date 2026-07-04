const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function inferCategory(name, fallback = "Autre") {
  const text = String(name || "").toLowerCase();
  const rules = [
    ["Frais", ["lait", "yaourt", "fromage", "beurre", "creme", "jambon", "oeuf", "salade", "tomate", "poulet", "viande", "poisson"]],
    ["Boissons", ["eau", "jus", "soda", "cafe", "the", "biere", "vin", "lait d'amande"]],
    ["Surgeles", ["surgele", "glace", "pizza surgelee", "legumes surgeles"]],
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

let db = null;
let writeQueue = Promise.resolve();

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function token() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), candidate);
}

async function ensureDb() {
  if (db) return db;
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    db = JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch {
    db = {
      users: [],
      families: [],
      memberships: [],
      invitations: [],
      sessions: [],
      groceryLists: [],
      items: [],
      recurringItems: [],
      trips: [],
      events: []
    };
    await saveDb();
  }
  return db;
}

async function saveDb() {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8")
  );
  return writeQueue;
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

function json(res, status, body) {
  send(res, status, body);
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function sessionCookie(value, maxAge = SESSION_TTL_MS) {
  return `session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "Corps JSON invalide.");
  }
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function requireText(value, label, min = 1, max = 120) {
  const text = String(value || "").trim();
  if (text.length < min) throw new ApiError(400, `${label} est obligatoire.`);
  if (text.length > max) throw new ApiError(400, `${label} est trop long.`);
  return text;
}

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ApiError(400, "Email invalide.");
  return value;
}

function getFamilyForUser(userId) {
  const membership = db.memberships.find((entry) => entry.userId === userId);
  if (!membership) return null;
  return db.families.find((family) => family.id === membership.familyId) || null;
}

function getMembership(userId, familyId) {
  return db.memberships.find((entry) => entry.userId === userId && entry.familyId === familyId);
}

function assertFamily(userId) {
  const family = getFamilyForUser(userId);
  if (!family) throw new ApiError(403, "Aucune famille associee a ce compte.");
  family.settings = family.settings || {};
  return family;
}

function familyMembers(familyId) {
  return db.memberships
    .filter((membership) => membership.familyId === familyId)
    .map((membership) => {
      const user = db.users.find((candidate) => candidate.id === membership.userId);
      return { ...publicUser(user), role: membership.role, joinedAt: membership.joinedAt };
    });
}

function activeList(familyId) {
  let list = db.groceryLists.find((entry) => entry.familyId === familyId && entry.status === "active");
  if (!list) {
    list = {
      id: id("list"),
      familyId,
      title: "Liste de courses",
      status: "active",
      shoppingDate: "",
      responsibleUserId: "",
      budget: 0,
      createdAt: now(),
      updatedAt: now()
    };
    db.groceryLists.push(list);
  }
  return list;
}

function listPayload(familyId) {
  const list = activeList(familyId);
  const members = familyMembers(familyId);
  const items = db.items
    .filter((item) => item.listId === list.id)
    .sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt.localeCompare(b.createdAt))
    .map((item) => ({
      ...item,
      addedByName: members.find((member) => member.id === item.addedBy)?.name || "Membre"
    }));
  return { list, items };
}

function dashboard(user) {
  const family = getFamilyForUser(user.id);
  if (!family) return { user: publicUser(user), family: null };
  const membership = getMembership(user.id, family.id);
  const { list, items } = listPayload(family.id);
  const recurringItems = db.recurringItems.filter((item) => item.familyId === family.id);
  const invitations = db.invitations
    .filter((invite) => invite.familyId === family.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const trips = db.trips.filter((trip) => trip.familyId === family.id).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const events = db.events.filter((event) => event.familyId === family.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  return {
    user: publicUser(user),
    family,
    membership,
    members: familyMembers(family.id),
    list,
    items,
    recurringItems,
    invitations,
    trips,
    events
  };
}

async function getCurrentUser(req) {
  await ensureDb();
  const cookie = parseCookies(req).session;
  if (!cookie) return null;
  const session = db.sessions.find((entry) => entry.token === cookie && new Date(entry.expiresAt) > new Date());
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

async function createSession(user, res) {
  const session = { id: id("sess"), userId: user.id, token: token(), createdAt: now(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
  db.sessions.push(session);
  await saveDb();
  res.setHeader("Set-Cookie", sessionCookie(session.token));
}

function addEvent(familyId, userId, type, message) {
  db.events.push({ id: id("evt"), familyId, userId, type, message, createdAt: now() });
}

async function requireUser(req) {
  const user = await getCurrentUser(req);
  if (!user) throw new ApiError(401, "Connexion requise.");
  return user;
}

async function handleApi(req, res, url) {
  await ensureDb();
  const method = req.method;
  const route = url.pathname;

  if (method === "GET" && route === "/api/me") {
    const user = await getCurrentUser(req);
    return json(res, 200, user ? dashboard(user) : { user: null });
  }

  if (method === "POST" && route === "/api/register") {
    const body = await readBody(req);
    const name = requireText(body.name, "Le nom", 2);
    const email = normalizeEmail(body.email);
    const password = requireText(body.password, "Le mot de passe", 8, 200);
    if (db.users.some((user) => user.email === email)) throw new ApiError(409, "Un compte existe deja avec cet email.");
    const user = { id: id("usr"), name, email, passwordHash: hashPassword(password), createdAt: now() };
    db.users.push(user);
    if (body.inviteToken) {
      const invite = db.invitations.find((entry) => entry.token === String(body.inviteToken) && entry.status === "active");
      if (!invite || new Date(invite.expiresAt) < new Date()) throw new ApiError(404, "Invitation invalide ou expiree.");
      db.memberships.push({ id: id("mem"), userId: user.id, familyId: invite.familyId, role: "member", joinedAt: now() });
      invite.status = "accepted";
      invite.acceptedBy = user.id;
      invite.acceptedAt = now();
      addEvent(invite.familyId, user.id, "invite", `${name} a rejoint la famille.`);
    } else {
      const familyName = requireText(body.familyName, "Le nom de la famille", 2);
      const family = { id: id("fam"), name: familyName, createdAt: now(), createdBy: user.id };
      db.families.push(family);
      db.memberships.push({ id: id("mem"), userId: user.id, familyId: family.id, role: "admin", joinedAt: now() });
      activeList(family.id);
      addEvent(family.id, user.id, "family", `${name} a cree la famille ${familyName}.`);
    }
    await saveDb();
    await createSession(user, res);
    return json(res, 201, dashboard(user));
  }

  if (method === "POST" && route === "/api/login") {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = requireText(body.password, "Le mot de passe", 1, 200);
    const user = db.users.find((candidate) => candidate.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) throw new ApiError(401, "Identifiants invalides.");
    await createSession(user, res);
    return json(res, 200, dashboard(user));
  }

  if (method === "POST" && route === "/api/logout") {
    const cookie = parseCookies(req).session;
    db.sessions = db.sessions.filter((session) => session.token !== cookie);
    await saveDb();
    res.setHeader("Set-Cookie", sessionCookie("", 0));
    return json(res, 200, { ok: true });
  }

  if (method === "GET" && route.startsWith("/api/invitations/")) {
    const inviteToken = route.split("/").pop();
    const invite = db.invitations.find((entry) => entry.token === inviteToken && entry.status === "active");
    if (!invite || new Date(invite.expiresAt) < new Date()) throw new ApiError(404, "Invitation invalide ou expiree.");
    const family = db.families.find((entry) => entry.id === invite.familyId);
    return json(res, 200, { token: invite.token, familyName: family?.name, expiresAt: invite.expiresAt });
  }

  if (method === "POST" && route.startsWith("/api/invitations/") && route.endsWith("/accept")) {
    const user = await requireUser(req);
    const inviteToken = route.split("/")[3];
    const invite = db.invitations.find((entry) => entry.token === inviteToken && entry.status === "active");
    if (!invite || new Date(invite.expiresAt) < new Date()) throw new ApiError(404, "Invitation invalide ou expiree.");
    if (getFamilyForUser(user.id)) throw new ApiError(409, "Ce compte appartient deja a une famille.");
    db.memberships.push({ id: id("mem"), userId: user.id, familyId: invite.familyId, role: "member", joinedAt: now() });
    invite.status = "accepted";
    invite.acceptedBy = user.id;
    invite.acceptedAt = now();
    addEvent(invite.familyId, user.id, "invite", `${user.name} a rejoint la famille.`);
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  const user = await requireUser(req);
  const family = assertFamily(user.id);

  if (method === "PATCH" && route === "/api/family") {
    const membership = getMembership(user.id, family.id);
    if (membership?.role !== "admin") throw new ApiError(403, "Seul un administrateur peut modifier la famille.");
    const body = await readBody(req);
    family.name = requireText(body.name || family.name, "Le nom de la famille", 2, 80);
    family.settings = {
      preferredStore: String(body.preferredStore || "").trim().slice(0, 120),
      defaultBudget: Math.max(0, Number(body.defaultBudget || 0)),
      notes: String(body.notes || "").trim().slice(0, 500)
    };
    if (family.settings.defaultBudget && !Number(activeList(family.id).budget || 0)) {
      activeList(family.id).budget = family.settings.defaultBudget;
    }
    addEvent(family.id, user.id, "family", `${user.name} a mis a jour les parametres famille.`);
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  if (method === "POST" && route === "/api/invitations") {
    const invite = {
      id: id("inv"),
      familyId: family.id,
      token: token(),
      status: "active",
      createdBy: user.id,
      createdAt: now(),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString()
    };
    db.invitations.push(invite);
    addEvent(family.id, user.id, "invite", `${user.name} a genere un lien d'invitation.`);
    await saveDb();
    return json(res, 201, { invite, app: dashboard(user) });
  }

  if (method === "DELETE" && route.startsWith("/api/invitations/")) {
    const inviteId = route.split("/").pop();
    const invite = db.invitations.find((entry) => entry.id === inviteId && entry.familyId === family.id);
    if (!invite) throw new ApiError(404, "Invitation introuvable.");
    invite.status = "revoked";
    addEvent(family.id, user.id, "invite", `${user.name} a desactive une invitation.`);
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  if (method === "PATCH" && route === "/api/list") {
    const body = await readBody(req);
    const list = activeList(family.id);
    list.shoppingDate = String(body.shoppingDate || "");
    list.responsibleUserId = String(body.responsibleUserId || "");
    list.budget = Math.max(0, Number(body.budget || 0));
    list.title = requireText(body.title || list.title, "Le titre", 1, 80);
    list.updatedAt = now();
    addEvent(family.id, user.id, "planning", `${user.name} a mis a jour le planning des courses.`);
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  if (method === "POST" && route === "/api/items") {
    const body = await readBody(req);
    const list = activeList(family.id);
    const item = {
      id: id("item"),
      listId: list.id,
      familyId: family.id,
      name: requireText(body.name, "Le produit", 1, 100),
      quantity: String(body.quantity || "1").trim(),
      unit: String(body.unit || "").trim(),
      category: inferCategory(body.name, String(body.category || "Autre").trim()),
      priority: String(body.priority || "normal").trim(),
      note: String(body.note || "").trim(),
      price: Math.max(0, Number(body.price || 0)),
      imageUrl: String(body.imageUrl || "").trim(),
      barcode: String(body.barcode || "").trim(),
      checked: false,
      addedBy: user.id,
      createdAt: now(),
      updatedAt: now()
    };
    db.items.push(item);
    list.updatedAt = now();
    addEvent(family.id, user.id, "item", `${user.name} a ajoute ${item.name}.`);
    await saveDb();
    return json(res, 201, dashboard(user));
  }

  if (method === "PATCH" && route.startsWith("/api/items/")) {
    const body = await readBody(req);
    const itemId = route.split("/").pop();
    const item = db.items.find((entry) => entry.id === itemId && entry.familyId === family.id);
    if (!item) throw new ApiError(404, "Produit introuvable.");
    if ("checked" in body) item.checked = Boolean(body.checked);
    for (const field of ["name", "quantity", "unit", "category", "priority", "note", "imageUrl", "barcode"]) {
      if (field in body) item[field] = String(body[field] || "").trim();
    }
    if ("price" in body) item.price = Math.max(0, Number(body.price || 0));
    item.updatedAt = now();
    activeList(family.id).updatedAt = now();
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  if (method === "DELETE" && route.startsWith("/api/items/")) {
    const itemId = route.split("/").pop();
    const item = db.items.find((entry) => entry.id === itemId && entry.familyId === family.id);
    if (!item) throw new ApiError(404, "Produit introuvable.");
    db.items = db.items.filter((entry) => entry.id !== itemId || entry.familyId !== family.id);
    addEvent(family.id, user.id, "item", `${user.name} a supprime ${item.name}.`);
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  if (method === "POST" && route === "/api/recurring") {
    const body = await readBody(req);
    const item = {
      id: id("rec"),
      familyId: family.id,
      name: requireText(body.name, "Le produit recurrent", 1, 100),
      quantity: String(body.quantity || "1").trim(),
      unit: String(body.unit || "").trim(),
      category: inferCategory(body.name, String(body.category || "Autre").trim()),
      price: Math.max(0, Number(body.price || 0)),
      note: String(body.note || "").trim(),
      imageUrl: String(body.imageUrl || "").trim(),
      barcode: String(body.barcode || "").trim(),
      createdAt: now()
    };
    db.recurringItems.push(item);
    await saveDb();
    return json(res, 201, dashboard(user));
  }

  if (method === "POST" && route === "/api/recurring/apply") {
    const list = activeList(family.id);
    const existing = new Set(db.items.filter((item) => item.listId === list.id).map((item) => item.name.toLowerCase()));
    for (const recurring of db.recurringItems.filter((item) => item.familyId === family.id)) {
      if (existing.has(recurring.name.toLowerCase())) continue;
      db.items.push({
        id: id("item"),
        listId: list.id,
        familyId: family.id,
        name: recurring.name,
        quantity: recurring.quantity,
        unit: recurring.unit,
        category: recurring.category,
        priority: "normal",
        note: recurring.note || "Habituel",
        price: recurring.price,
        imageUrl: recurring.imageUrl || "",
        barcode: recurring.barcode || "",
        checked: false,
        addedBy: user.id,
        createdAt: now(),
        updatedAt: now()
      });
    }
    addEvent(family.id, user.id, "recurring", `${user.name} a ajoute les produits habituels.`);
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  if (method === "DELETE" && route.startsWith("/api/recurring/")) {
    const recurringId = route.split("/").pop();
    db.recurringItems = db.recurringItems.filter((item) => item.id !== recurringId || item.familyId !== family.id);
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  if (method === "POST" && route === "/api/trips/complete") {
    const list = activeList(family.id);
    const items = db.items.filter((item) => item.listId === list.id);
    const total = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
    const trip = {
      id: id("trip"),
      familyId: family.id,
      title: list.title,
      shoppingDate: list.shoppingDate,
      responsibleUserId: list.responsibleUserId,
      completedBy: user.id,
      completedAt: now(),
      budget: list.budget,
      total,
      items: items.map((item) => ({ ...item }))
    };
    db.trips.push(trip);
    list.status = "archived";
    const nextList = {
      id: id("list"),
      familyId: family.id,
      title: "Liste de courses",
      status: "active",
      shoppingDate: "",
      responsibleUserId: "",
      budget: list.budget,
      createdAt: now(),
      updatedAt: now()
    };
    db.groceryLists.push(nextList);
    addEvent(family.id, user.id, "trip", `${user.name} a archive une liste de courses.`);
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  if (method === "POST" && route.startsWith("/api/trips/") && route.endsWith("/duplicate")) {
    const tripId = route.split("/")[3];
    const trip = db.trips.find((entry) => entry.id === tripId && entry.familyId === family.id);
    if (!trip) throw new ApiError(404, "Historique introuvable.");
    const list = activeList(family.id);
    const existing = new Set(db.items.filter((item) => item.listId === list.id).map((item) => item.name.toLowerCase()));
    for (const oldItem of trip.items) {
      if (existing.has(oldItem.name.toLowerCase())) continue;
      db.items.push({
        ...oldItem,
        id: id("item"),
        listId: list.id,
        familyId: family.id,
        checked: false,
        addedBy: user.id,
        createdAt: now(),
        updatedAt: now()
      });
    }
    addEvent(family.id, user.id, "trip", `${user.name} a recopie une ancienne liste.`);
    await saveDb();
    return json(res, 200, dashboard(user));
  }

  throw new ApiError(404, "Route introuvable.");
}

async function serveStatic(req, res, url) {
  let filePath = url.pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Acces refuse.");
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const ext = path.extname(filePath);
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    const content = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
    res.end(content);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }
    return await serveStatic(req, res, url);
  } catch (error) {
    if (error instanceof ApiError) return json(res, error.status, { error: error.message });
    console.error(error);
    return json(res, 500, { error: "Erreur serveur." });
  }
});

ensureDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Application prete sur http://localhost:${PORT}`);
  });
});
