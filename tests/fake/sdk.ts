// In-memory stand-in for @base44/sdk: entities with filter/get/create/update/delete.
const g = globalThis as any;
g.__db ||= new Map<string, Map<string, any>>();
g.__seq ||= 0;
g.__calls ||= 0;
const table = (n: string) => { if (!g.__db.has(n)) g.__db.set(n, new Map()); return g.__db.get(n); };
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const match = (row, q) => Object.entries(q || {}).every(([k, v]: any) => {
  const x = row[k];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if ('$lte' in v && !(x <= v.$lte)) return false;
    if ('$gte' in v && !(x >= v.$gte)) return false;
    if ('$lt' in v && !(x < v.$lt)) return false;
    if ('$gt' in v && !(x > v.$gt)) return false;
    if ('$in' in v && !v.$in.includes(x)) return false;
    if ('$ne' in v && x === v.$ne) return false;
    return true;
  }
  return (x ?? null) === (v ?? null) || (v === false && x === undefined);
});
// Stress tests can set g.__gate to a function that throws (like the platform's rate limit) before an operation.
const gate = () => { if (g.__gate) g.__gate(); };
function entity(name: string) {
  return {
    async filter(q, o: any = {}) {
      gate(); g.__calls++; if (g.__byOp) g.__byOp[name + '.filter'] = (g.__byOp[name + '.filter'] || 0) + 1;
      let rows = [...table(name).values()].filter((r) => match(r, q));
      if (o.sort) { const desc = o.sort.startsWith('-'), f = o.sort.replace(/^-/, ''); rows.sort((a, b) => (a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0) * (desc ? -1 : 1)); }
      if (o.skip) rows = rows.slice(o.skip);
      if (o.limit) rows = rows.slice(0, o.limit);
      return { items: clone(rows) };
    },
    async list(sort, limit) { return (await this.filter({}, { sort, limit })).items; },
    async get(id) { gate(); g.__calls++; if (g.__byOp) g.__byOp[name + '.get'] = (g.__byOp[name + '.get'] || 0) + 1; const r = table(name).get(id); if (!r) { const e: any = new Error('Not found'); e.status = 404; throw e; } return clone(r); },
    async create(d) { gate(); g.__calls++; if (g.__byOp) g.__byOp[name + '.create'] = (g.__byOp[name + '.create'] || 0) + 1; const id = `${name}_${++g.__seq}`; const r = { ...clone(d), id, created_date: new Date(Date.now()).toISOString() + String(g.__seq).padStart(6, '0') }; table(name).set(id, r); return clone(r); },
    async update(id, d) { gate(); g.__calls++; if (g.__byOp) g.__byOp[name + '.update'] = (g.__byOp[name + '.update'] || 0) + 1; const r = table(name).get(id); if (!r) { const e: any = new Error('Not found'); e.status = 404; throw e; } Object.assign(r, clone(d)); return clone(r); },
    async delete(id) { gate(); g.__calls++; if (g.__byOp) g.__byOp[name + '.delete'] = (g.__byOp[name + '.delete'] || 0) + 1; table(name).delete(id); return {}; }
  };
}
const entities = new Proxy({}, { get: (_, n: string) => entity(n) });
// Integrations: tests set g.__llm(params) and g.__upload(params) to answer like the platform would.
const integrations = { Core: {
  async InvokeLLM(params) { g.__llmCalls = (g.__llmCalls || 0) + 1; if (g.__byOp) g.__byOp['llm'] = (g.__byOp['llm'] || 0) + 1; if (!g.__llm) throw new Error('no llm'); return await g.__llm(params); },
  async UploadFile(params) { g.__uploads = (g.__uploads || 0) + 1; if (g.__byOp) g.__byOp['upload'] = (g.__byOp['upload'] || 0) + 1; if (g.__upload) return await g.__upload(params); return { file_url: `https://files.example/${params.file.name}` }; }
} };
export function createClientFromRequest(_req) { return { asServiceRole: { entities, integrations }, entities, integrations }; }
export function createClient() { return createClientFromRequest(null); }
