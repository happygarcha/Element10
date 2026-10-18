// In-memory state with pluggable persistence. The whole data set is loaded after login (single-user, thousands
// of rows) so every screen filters and sorts locally; writes go straight through to the adapter.
import { uid } from "./util.js";

export const TABLES = ["imports", "products", "observations", "watchlists", "watchlist_items", "alert_rules", "alerts", "keywords",
  "keyword_observations", "fee_profiles", "settings", "projects", "project_items", "calc_runs", "ad_terms", "suppliers", "reviews", "provider_results", "niches"];
const TS = ["as_of", "first_seen", "uploaded_at", "created_at", "added_at", "triggered_at", "verified_at", "quoted_at", "reviewed_at", "retrieved_at"];
const iso = (v) => { if (!v) return v; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toISOString().replace(/\.\d{3}Z$/, "Z"); };

export class Store {
  constructor(adapter, label = "") {
    this.adapter = adapter; this.label = label; this.t = {}; this.reset();
  }
  reset() { for (const n of TABLES) this.t[n] = []; this.obs = new Map(); }
  async load() {
    this.reset();
    for (const n of TABLES) {
      const rows = await this.adapter.fetchAll(n);
      this.t[n] = rows.map((r) => { for (const k of TS) if (k in r) r[k] = iso(r[k]); return r; });
    }
    for (const o of this.t.observations) this._idx(o);
  }
  _idx(o) { if (!this.obs.has(o.product_id)) this.obs.set(o.product_id, []); this.obs.get(o.product_id).push(o); }
  async add(table, row) { return (await this.addMany(table, [row]))[0]; }
  async addMany(table, rows) {
    for (const r of rows) { r.id = r.id || uid(); this.t[table].push(r); if (table === "observations") this._idx(r); }
    try { for (let i = 0; i < rows.length; i += 400) await this.adapter.insert(table, rows.slice(i, i + 400)); }
    catch (e) { // do not show work as saved when the database refused it
      const ids = new Set(rows.map((r) => r.id)); this.t[table] = this.t[table].filter((x) => !ids.has(x.id));
      if (table === "observations") for (const [k, v] of this.obs) this.obs.set(k, v.filter((o) => !ids.has(o.id)));
      throw e;
    }
    return rows;
  }
  async update(table, id, patch) {
    const r = this.t[table].find((x) => x.id === id); if (!r) throw new Error(`${table} ${id} not found`);
    const before = {}; for (const k of Object.keys(patch)) before[k] = r[k];
    Object.assign(r, patch);
    try { await this.adapter.update(table, id, patch); } catch (e) { Object.assign(r, before); throw e; }
    return r;
  }
  async remove(table, id) {
    this.t[table] = this.t[table].filter((x) => x.id !== id);
    if (table === "products") this.obs.delete(id);
    await this.adapter.remove(table, id);
  }
  // --- lookups
  get(table, id) { return this.t[table].find((x) => x.id === id) || null; }
  product(asin, mp) { return this.t.products.find((p) => p.asin === asin && p.marketplace === mp) || null; }
  setting(key, dflt = null) { const r = this.t.settings.find((s) => s.key === key); return r ? r.value : dflt; }
  async setSetting(key, value) {
    const r = this.t.settings.find((s) => s.key === key);
    if (r) await this.update("settings", r.id, { value }); else await this.add("settings", { key, value });
  }
  observations(pid) { return this.obs.get(pid) || []; }
}

// ---------------- adapters ----------------
export class MemoryAdapter {           // tests and demo mode: nothing is saved
  async fetchAll() { return []; }
  async insert() {} async update() {} async remove() {}
}

export class LocalAdapter {            // this device only (IndexedDB)
  constructor(ns = "element10-local") { this.ns = ns; this.dbp = null; }
  _db() {
    if (!this.dbp) this.dbp = new Promise((res, rej) => {
      const q = indexedDB.open(this.ns, 1);
      q.onupgradeneeded = () => { const s = q.result.createObjectStore("rows", { keyPath: "k" }); s.createIndex("t", "t"); };
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    return this.dbp;
  }
  _tx(mode, fn) {
    return this._db().then((db) => new Promise((res, rej) => {
      const tx = db.transaction("rows", mode), req = fn(tx.objectStore("rows"));
      tx.oncomplete = () => res(req && req.result !== undefined ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
    }));
  }
  async fetchAll(table) { const r = await this._tx("readonly", (s) => s.index("t").getAll(table)); return (r || []).map((x) => x.v); }
  async insert(table, rows) { await this._tx("readwrite", (s) => { for (const r of rows) s.put({ k: `${table}/${r.id}`, t: table, v: r }); }); }
  async update(table, id, patch) {
    await this._tx("readwrite", (s) => { const g = s.get(`${table}/${id}`); g.onsuccess = () => { if (g.result) { Object.assign(g.result.v, patch); s.put(g.result); } }; });
  }
  async remove(table, id) { await this._tx("readwrite", (s) => { s.delete(`${table}/${id}`); }); }
}

export class SupabaseAdapter {         // your Supabase project: login required, rows protected by row-level security
  constructor(client) { this.c = client; }
  async fetchAll(table) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.c.from(table).select("*").range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...data); if (data.length < 1000) break;
    }
    return out.map(({ user_id, ...row }) => row);
  }
  async insert(table, rows) { const { error } = await this.c.from(table).insert(rows); if (error) throw new Error(`${table}: ${error.message}`); }
  async update(table, id, patch) { const { error } = await this.c.from(table).update(patch).eq("id", id); if (error) throw new Error(`${table}: ${error.message}`); }
  async remove(table, id) { const { error } = await this.c.from(table).delete().eq("id", id); if (error) throw new Error(`${table}: ${error.message}`); }
}
