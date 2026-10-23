/**
 * Voznest Forge SDK — a tiny SDK for Voznest bots (download it as voznest.mjs).
 *
 *   const bot = new VoznestBot({ apiUrl, token, applicationId });
 *   bot.command({ name: "ping", description: "Pong!" }, (ctx) => ctx.reply({ content: "Pong!" }));
 *   bot.command({ name: "setup", description: "Only here", serverIds: ["<hubId>"] }, handler); // hub command
 *   bot.button("vote:", (ctx) => ctx.reply({ content: "Thanks!", ephemeral: true }));
 *   await bot.start(); // syncs every command (global + per hub), then connects
 *
 * Needs Node 18+ and `socket.io-client`.
 *
 * The bot runs in its own process, on YOUR machine or host: it talks to
 * Voznest over the public REST API and the realtime gateway (Socket.IO).
 * Voznest never hosts or executes bot code.
 *
 * The platform was called Quorvyn before: the Quorvyn* exports and QUORVYN_*
 * variables keep working, so bots written against the old names don't break.
 */
import { io } from "socket.io-client";

/** The public Voznest API. Your bot runs on your own machine or host and talks to it over HTTPS. */
export const QUORVYN_API = "https://api.voznest.com";

export class QuorvynApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ─────────── Builders ─────────── */

export const colors = { violet: "#7c5cff", cyan: "#22d3ee", green: "#2fd27e", amber: "#f5b544", red: "#f2555a", pink: "#ec4899", slate: "#64748b" };

/** Fluent embed builder → plain JSON the API accepts. */
export class Embed {
  constructor(data = {}) {
    this.data = { ...data };
  }
  title(v) { this.data.title = String(v).slice(0, 256); return this; }
  description(v) { this.data.description = String(v).slice(0, 4096); return this; }
  url(v) { this.data.url = v; return this; }
  color(v) { this.data.color = colors[v] ?? v; return this; }
  author(name, iconUrl, url) { this.data.author = { name: String(name).slice(0, 256), ...(iconUrl ? { iconUrl } : {}), ...(url ? { url } : {}) }; return this; }
  thumbnail(v) { if (v) this.data.thumbnailUrl = v; return this; }
  image(v) { if (v) this.data.imageUrl = v; return this; }
  field(name, value, inline = false) {
    (this.data.fields ??= []).push({ name: String(name).slice(0, 256) || "​", value: String(value).slice(0, 1024) || "​", inline });
    return this;
  }
  footer(text, iconUrl) { this.data.footer = String(text).slice(0, 2048); if (iconUrl) this.data.footerIconUrl = iconUrl; return this; }
  timestamp(date = new Date()) { this.data.timestamp = new Date(date).toISOString(); return this; }
  toJSON() { return this.data; }
}

export const embed = (data) => new Embed(data);

export const button = ({ label, customId, style = "secondary", emoji, url, disabled }) => ({
  type: "button",
  style: url ? "link" : style,
  ...(label ? { label: String(label).slice(0, 80) } : {}),
  ...(emoji ? { emoji } : {}),
  ...(url ? { url } : { customId }),
  ...(disabled ? { disabled: true } : {}),
});

export const select = ({ customId, placeholder, options, minValues, maxValues, disabled }) => ({
  type: "select",
  customId,
  ...(placeholder ? { placeholder } : {}),
  ...(minValues !== undefined ? { minValues } : {}),
  ...(maxValues !== undefined ? { maxValues } : {}),
  ...(disabled ? { disabled: true } : {}),
  options: options.slice(0, 25),
});

export const row = (...components) => ({ type: "row", components: components.flat().slice(0, 5) });

/**
 * Embeds v2 + v3 builders: plain objects for `blocks`. Send with
 * `ctx.reply({ blocks: [b.container({ accent: "#7c5cff" }, b.header("Hi"), b.text("**Hello**"))] })`.
 * Full reference: https://voznest.com/developers/docs/embeds-v2 · design them at /developers/studio.
 */
export const blocks = {
  text: (content, opts = {}) => ({ type: "text", content, ...opts }),
  header: (title, opts = {}) => ({ type: "header", title, ...opts }),
  image: (url, opts = {}) => ({ type: "image", url, ...opts }),
  gallery: (items, opts = {}) => ({ type: "gallery", items: items.map((i) => (typeof i === "string" ? { url: i } : i)), ...opts }),
  separator: (opts = {}) => ({ type: "separator", ...opts }),
  fields: (items, opts = {}) => ({ type: "fields", items: Object.entries(items).map(([name, value]) => ({ name, value: String(value) })), ...opts }),
  stats: (...items) => ({ type: "stats", items: items.flat() }),
  progress: (value, opts = {}) => ({ type: "progress", value, ...opts }),
  table: (columns, rows, opts = {}) => ({ type: "table", columns: columns.map((c) => (typeof c === "string" ? { label: c } : c)), rows: rows.map((r) => r.map(String)), ...opts }),
  callout: (tone, content, opts = {}) => ({ type: "callout", tone, content, ...opts }),
  code: (content, language, opts = {}) => ({ type: "code", content, ...(language ? { language } : {}), ...opts }),
  countdown: (to, opts = {}) => ({ type: "countdown", to: new Date(to).toISOString(), ...opts }),
  badges: (...items) => ({ type: "badges", items: items.flat().map((i) => (typeof i === "string" ? { label: i } : i)) }),
  chart: (kind, data, opts = {}) => ({ type: "chart", kind, data: Array.isArray(data) ? data : Object.entries(data).map(([label, value]) => ({ label, value })), ...opts }),
  list: (items, opts = {}) => ({ type: "list", items: items.map((i) => (typeof i === "string" ? { text: i } : i)), ...opts }),
  actions: (...components) => ({ type: "actions", components: components.flat() }),
  section: (children, accessory) => ({ type: "section", blocks: [children].flat(), ...(accessory ? { accessory } : {}) }),
  thumbnail: (url, alt) => ({ type: "thumbnail", url, ...(alt ? { alt } : {}) }),
  columns: (...cols) => ({ type: "columns", columns: cols.map((c) => (Array.isArray(c) ? { blocks: c } : c)) }),
  container: (opts, ...children) => ({ type: "container", ...opts, blocks: children.flat() }),
  tabs: (tabs) => ({ type: "tabs", tabs: Object.entries(tabs).map(([label, b]) => ({ label, blocks: [b].flat() })) }),
  accordion: (items) => ({ type: "accordion", items: Object.entries(items).map(([title, b]) => ({ title, blocks: [b].flat() })) }),
  pages: (...pages) => ({ type: "pages", pages: pages.map((p) => (Array.isArray(p) ? { blocks: p } : p)) }),

  /* Embeds v3 — every hub, DM and webhook. Icons are Lucide names (see /developers/docs/embeds-v3). */
  /** A card with an animated gradient frame: `b.themed("sunset", ...)` or `b.themed(["#ff0080", "#7928ca"], ...)`. */
  themed: (theme, ...children) => ({ type: "container", ...(Array.isArray(theme) ? { gradient: theme } : { theme }), blocks: children.flat() }),
  hero: (title, opts = {}) => ({ type: "hero", title, ...opts }),
  features: (items, opts = {}) => ({ type: "features", items: items.map((i) => (Array.isArray(i) ? { icon: i[0], title: i[1], text: i[2] } : i)), ...opts }),
  steps: (items) => ({ type: "steps", items: items.map((i) => (typeof i === "string" ? { title: i } : Array.isArray(i) ? { icon: i[0], title: i[1], ...(i[2] ? { text: i[2] } : {}) } : i)) }),
  timeline: (items) => ({ type: "timeline", items: items.map((i) => (Array.isArray(i) ? { time: i[0], title: i[1], ...(i[2] ? { text: i[2] } : {}) } : i)) }),
  quote: (content, opts = {}) => ({ type: "quote", content, ...opts }),
  cards: (items, opts = {}) => ({ type: "cards", items, ...opts }),
  rating: (value, opts = {}) => ({ type: "rating", value, ...opts }),
};

/** Embeds v3 gradient themes (or pass your own 2–3 colors as `gradient`). */
export const themes = ["aurora", "nebula", "ember", "emerald", "gold", "ocean", "sunset", "candy", "midnight", "forest", "neon", "rose", "ice", "lava", "royal", "mono"];

/** Accepts builders or plain objects inside a message payload. */
function serialize(payload = {}) {
  const out = { ...payload };
  if (out.embeds) out.embeds = out.embeds.map((e) => (e instanceof Embed ? e.toJSON() : e));
  if (out.embed) {
    out.embeds = [...(out.embeds ?? []), out.embed instanceof Embed ? out.embed.toJSON() : out.embed];
    delete out.embed;
  }
  return out;
}

/* ─────────── Interaction context ─────────── */

class InteractionContext {
  constructor(bot, d) {
    this.bot = bot;
    this.raw = d;
    this.id = d.id;
    this.token = d.token;
    this.type = d.type;
    this.serverId = d.serverId;
    this.channelId = d.channelId;
    this.user = d.user;
    this.member = d.member;
    this.data = d.data;
    this.message = d.message;
    this.acknowledged = false;
  }
  /** Value of a command option (resolved objects for user/channel/role). */
  option(name, fallback) {
    const o = this.data.options?.find((x) => x.name === name);
    if (!o) return fallback;
    if (o.type === "user") return this.data.resolved?.users?.[o.value] ?? { id: o.value };
    if (o.type === "channel") return this.data.resolved?.channels?.[o.value] ?? { id: o.value };
    if (o.type === "role") return this.data.resolved?.roles?.[o.value] ?? { id: o.value };
    return o.value;
  }
  can(permission) {
    return this.member?.permissions?.includes("administrator") || this.member?.permissions?.includes(permission);
  }
  async #callback(type, data) {
    this.acknowledged = true;
    return this.bot.api("POST", `/interactions/${this.id}/${this.token}/callback`, { type, ...(data ? { data: serialize(data) } : {}) });
  }
  /** Post an answer (ephemeral: true = only the member sees it). Call again for follow-ups. */
  reply(data) { return this.#callback("reply", typeof data === "string" ? { content: data } : data); }
  /** Another message after the first answer (same as reply; reads better). */
  followUp(data) { return this.reply(data); }
  /** Acknowledge now, answer later (up to 15 minutes). */
  defer() { return this.#callback("defer"); }
  /** First answer only: open a form (1–5 fields). Its submission arrives as a component interaction with the form's customId. */
  modal(form) { return this.#callback("modal", { modal: form }); }
  /** A submitted form field, or a select menu's values. */
  field(customId, fallback = "") { return this.data.fields?.find((f) => f.customId === customId)?.value ?? fallback; }
  get values() { return this.data.values ?? []; }
  /** Components only: edit the message the control belongs to. */
  update(data) { return this.#callback("update", typeof data === "string" ? { content: data } : data); }
  /** Short private error message. */
  fail(text) { return this.reply({ ephemeral: true, embeds: [embed().color("red").description(text)] }); }
}

/* ─────────── Client ─────────── */

export class QuorvynBot {
  constructor({ apiUrl = QUORVYN_API, token, applicationId, logger = console }) {
    if (!token || !applicationId) throw new Error("token and applicationId are required");
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.token = token;
    this.applicationId = applicationId;
    this.log = logger;
    this.commands = new Map(); // "name" (global) or "hubId:name" → { definition, handler, serverIds }
    this.components = [];
    this.listeners = new Map();
    this.user = null;
    this.startedAt = Date.now();
  }

  /** REST call with the bot token. Throws QuorvynApiError on failures. */
  async api(method, path, body) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${this.apiUrl}/api/v1${path}`, {
        method,
        headers: { Authorization: `Bot ${this.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after") ?? 1);
        await new Promise((r) => setTimeout(r, Math.min(10, wait) * 1000));
        continue;
      }
      if (res.status === 204) return null;
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new QuorvynApiError(res.status, json?.error?.code ?? "HTTP_ERROR", json?.error?.message ?? `HTTP ${res.status}`);
      return json?.data;
    }
    throw new QuorvynApiError(429, "RATE_LIMITED", "Rate limited");
  }

  send(channelId, payload) { return this.api("POST", `/channels/${channelId}/messages`, serialize(typeof payload === "string" ? { content: payload } : payload)); }
  edit(messageId, payload) { return this.api("PATCH", `/messages/${messageId}`, serialize(typeof payload === "string" ? { content: payload } : payload)); }

  /**
   * Register a slash command and its handler. Pass `serverIds: [...]` in the
   * definition to make it a hub command (only exists in those hubs).
   */
  command(definition, handler) {
    const { serverIds, ...def } = definition;
    if (!/^[a-z0-9_-]{1,32}$/.test(def.name)) throw new Error(`Invalid command name "${def.name}" (a-z, 0-9, _ and -, up to 32).`);
    if (!def.description) throw new Error(`Command "${def.name}" needs a description.`);
    this.commands.set(def.name, { definition: def, handler, serverIds: serverIds?.length ? [...new Set(serverIds)] : null });
    return this;
  }
  /** Handle buttons/menus whose customId starts with `prefix`. */
  button(prefix, handler) {
    this.components.push({ prefix, handler });
    return this;
  }
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
    return this;
  }

  /**
   * Makes Voznest's command list match this bot's code: global commands with
   * one PUT, then one PUT per hub that has hub commands. Commands you removed
   * from the code disappear. Hubs where the app isn't installed are skipped.
   */
  async syncCommands() {
    const all = [...this.commands.values()];
    const global = all.filter((c) => !c.serverIds).map((c) => c.definition);
    await this.api("PUT", `/applications/${this.applicationId}/commands`, global);
    const perHub = new Map();
    for (const c of all) for (const id of c.serverIds ?? []) perHub.set(id, [...(perHub.get(id) ?? []), c.definition]);
    // Hubs that had hub commands before but no longer do get emptied.
    for (const hub of (await this.status().catch(() => null))?.hubs ?? []) if (hub.commands > 0 && !perHub.has(hub.id)) perHub.set(hub.id, []);
    let hubCount = 0;
    for (const [serverId, list] of perHub) {
      try {
        await this.api("PUT", `/applications/${this.applicationId}/servers/${serverId}/commands`, list);
        hubCount += list.length;
      } catch (err) {
        this.log.warn?.(`[voznest] hub ${serverId}: ${err.message}`);
      }
    }
    this.log.info?.(`[voznest] synced ${global.length} global${hubCount ? ` + ${hubCount} hub` : ""} commands`);
    return { global: global.length, hub: hubCount };
  }

  /** Connection, command sync and the hubs this app is installed in. */
  status() { return this.api("GET", `/applications/${this.applicationId}/bot`); }

  /** Change the bot's profile: { username, displayName, bio, avatar, banner, hue } (avatar/banner = upload ids). */
  setProfile(patch) { return this.api("PATCH", `/applications/${this.applicationId}/bot`, patch); }

  /** Upload a file (Blob/Buffer) and get an id to use as avatar/banner or a message attachment. */
  async upload(data, filename, purpose = "message", type = "image/png") {
    const form = new FormData();
    form.append("file", data instanceof Blob ? data : new Blob([data], { type }), filename);
    const res = await fetch(`${this.apiUrl}/api/v1/uploads?purpose=${purpose}`, { method: "POST", headers: { Authorization: `Bot ${this.token}` }, body: form });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new QuorvynApiError(res.status, json?.error?.code ?? "HTTP_ERROR", json?.error?.message ?? `HTTP ${res.status}`);
    return json.data;
  }

  /** Shown under the bot's name, e.g. { type: "playing", name: "/help" }. */
  setActivity(activity) { this.socket?.emit("presence:activity", activity); }

  async #dispatch(d) {
    const ctx = new InteractionContext(this, d);
    try {
      if (d.type === "command") {
        const cmd = this.commands.get(d.data.name);
        if (!cmd) return ctx.fail("This command isn't available anymore.");
        await cmd.handler(ctx);
      } else {
        const h = this.components.find((c) => d.data.customId.startsWith(c.prefix));
        if (!h) return ctx.fail("That control has expired.");
        await h.handler(ctx, d.data.customId.slice(h.prefix.length));
      }
      if (!ctx.acknowledged) await ctx.fail("Nothing to show.");
    } catch (err) {
      this.log.error?.(`[voznest] interaction ${d.data.name ?? d.data.customId} failed:`, err.message);
      if (!ctx.acknowledged) await ctx.fail(err instanceof QuorvynApiError ? err.message : "Something went wrong.").catch(() => undefined);
      else await ctx.reply({ ephemeral: true, content: err.message }).catch(() => undefined);
    }
  }

  /** Registers commands, connects to the gateway and keeps the connection alive. */
  async start({ activity, sync = true } = {}) {
    this.user = await this.api("GET", "/users/@me");
    if (sync) await this.syncCommands();
    this.socket = io(this.apiUrl, { auth: { token: `Bot ${this.token}` }, transports: ["websocket"], reconnection: true });
    this.socket.on("connect", () => this.log.info?.(`[voznest] connected as ${this.user.username}`));
    this.socket.on("connect_error", (e) => this.log.warn?.(`[voznest] connection error: ${e.message}`));
    this.socket.on("ready", () => {
      if (activity) this.socket.emit("presence:activity", activity);
      for (const h of this.listeners.get("ready") ?? []) void h();
    });
    this.socket.on("event", ({ t, d }) => {
      if (t === "INTERACTION_CREATE") return void this.#dispatch(d);
      for (const h of this.listeners.get(t) ?? []) Promise.resolve(h(d)).catch((err) => this.log.error?.(`[voznest] ${t} handler:`, err.message));
    });
    return this;
  }

  /** Round trip to the gateway, in ms. */
  ping() {
    return new Promise((resolve) => {
      const t = Date.now();
      this.socket.timeout(4000).emit("rtt", {}, () => resolve(Date.now() - t));
    });
  }

  stop() {
    this.socket?.disconnect();
  }
}

/* ─────────── Helpers ─────────── */

/**
 * Loads KEY=value lines from a .env file into process.env (existing
 * variables win). Keep the token there, never in your code.
 */
export async function loadEnv(file) {
  const { readFileSync, existsSync } = await import("node:fs");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/* ─────────── Event delivery (webhooks) ─────────── */

export class QuorvynWebhookError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const seenSignatures = new Map();

/**
 * Verifies an event delivery before you trust it. Pass the RAW request body
 * (the exact bytes, not re-serialized JSON), the request headers and the
 * endpoint's signing secret (qds_…). Checks, in order:
 *   - the X-Quorvyn-* headers are present,
 *   - the timestamp is within `toleranceSec` (default 5 minutes) of now,
 *   - the HMAC-SHA256 signature over "<timestamp>.<body>" (constant-time),
 *   - the same signed request wasn't already accepted (replay).
 * Retries carry the same delivery id with a new timestamp and signature, so
 * they pass; make your handler idempotent on `event.id`.
 * Throws QuorvynWebhookError (code: missing_headers | stale | bad_signature | replay | bad_body).
 */
export async function verifyWebhook({ headers, body, secret, toleranceSec = 300, now = Date.now() }) {
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const get = (k) => {
    const v = typeof headers?.get === "function" ? headers.get(k) : (headers?.[k] ?? headers?.[k.toLowerCase()]);
    return Array.isArray(v) ? v[0] : v;
  };
  const ts = get("x-quorvyn-timestamp");
  const sig = get("x-quorvyn-signature");
  const id = get("x-quorvyn-delivery");
  const raw = Buffer.isBuffer(body) ? body.toString("utf8") : body;
  if (!ts || !sig || !id || typeof raw !== "string" || !secret) throw new QuorvynWebhookError("missing_headers", "Not a signed Voznest delivery.");
  if (!/^\d{1,12}$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > toleranceSec) throw new QuorvynWebhookError("stale", "Delivery timestamp is outside the allowed window.");
  const expected = Buffer.from(`v1=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`);
  const given = Buffer.from(String(sig));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new QuorvynWebhookError("bad_signature", "Signature doesn't match.");
  for (const [k, until] of seenSignatures) if (until < now) seenSignatures.delete(k);
  const nonce = `${id}:${ts}`;
  if (seenSignatures.has(nonce)) throw new QuorvynWebhookError("replay", "This delivery was already accepted.");
  seenSignatures.set(nonce, now + toleranceSec * 2000);
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new QuorvynWebhookError("bad_body", "Body is not JSON.");
  }
  return { event, deliveryId: id, eventType: get("x-quorvyn-event") };
}

/** VOZNEST_* first, then the earlier QUORVYN_* names. */
const envVar = (name) => process.env[`VOZNEST_${name}`] || process.env[`QUORVYN_${name}`];

/** A bot configured from VOZNEST_API_URL / VOZNEST_BOT_TOKEN / VOZNEST_APP_ID (QUORVYN_* also accepted). */
export function botFromEnv(options = {}) {
  const missing = ["BOT_TOKEN", "APP_ID"].filter((k) => !envVar(k)).map((k) => `VOZNEST_${k}`);
  if (missing.length) throw new Error(`Missing ${missing.join(" and ")} — copy them from Voznest Forge → your app → Bot into .env`);
  return new QuorvynBot({ apiUrl: envVar("API_URL") || QUORVYN_API, token: envVar("BOT_TOKEN"), applicationId: envVar("APP_ID"), ...options });
}

// Current names for the same SDK pieces (the Quorvyn* exports above stay for existing bots).
export { QuorvynBot as VoznestBot, QuorvynApiError as VoznestApiError, QuorvynWebhookError as VoznestWebhookError, QUORVYN_API as VOZNEST_API };
