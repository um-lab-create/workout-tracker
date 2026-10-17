#!/usr/bin/env node
'use strict';

// Network-free regression tests: deferred requests exercise the real queue/data/sync layers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { webcrypto } = require('node:crypto');

const root = path.join(__dirname, '..');
const clientSource = fs.readFileSync(path.join(root, 'js/supabase-client.js'), 'utf8');
const syncSource = fs.readFileSync(path.join(root, 'js/sync.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const slot = { date: '2026-10-17', timingKey: 'lunch' };
const clone = (value) => JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function meal(overrides = {}) {
  return {
    id: 'local-a', ...slot, timing: '昼', synced: false,
    updatedAt: '2026-10-17T01:00:00.000Z', note: '', memo: 'sample',
    kcal: 420, protein: 20, fat: 10, carb: 60, items: [], structuredItems: [],
    ...overrides
  };
}

async function harness() {
  const storage = new Map();
  const fixtures = { meals: [], meal_items: [], meal_dining_context: [] };
  const reads = [];
  const ui = [];
  let records = [];
  const session = { user: { id: 'synthetic-user' } };
  const controls = {
    getSession: async () => ({ data: { session }, error: null }),
    saveMeal: async () => ({ data: 'synthetic-meal', error: null }),
    deleteMeal: async () => ({ data: null, error: null })
  };
  const client = {
    auth: { getSession: () => controls.getSession() },
    rpc(name, payload) {
      assert.equal(name, 'save_meal_with_items');
      return controls.saveMeal(clone(payload));
    },
    from(table) {
      let ids, deleting = false;
      const orders = [];
      const query = {
        select() { return query; },
        gte() { return query; },
        lte() { return query; },
        order(column) { orders.push(column); return query; },
        in(column, values) { assert.equal(column, 'meal_id'); ids = values; return query; },
        delete() { deleting = true; return query; },
        eq() { return query; },
        range(from, to) {
          reads.push({ table, from, to, orders: [...orders], ids });
          const rows = fixtures[table].filter((row) => !ids || ids.includes(row.meal_id));
          return Promise.resolve({ data: clone(rows.slice(from, to + 1)), error: null });
        },
        then(resolve, reject) {
          assert.ok(deleting, 'Unexpected unpaged read');
          return controls.deleteMeal().then(resolve, reject);
        }
      };
      return query;
    }
  };
  const g = {
    console, Promise, Map, Set, Date: class extends Date {}, Math, crypto: webcrypto,
    navigator: { onLine: true },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    lsGet: (key, fallback) => storage.has(key) ? JSON.parse(storage.get(key)) : fallback,
    lsSet: (key, value) => storage.set(key, JSON.stringify(value)),
    getRecords: () => clone(records),
    saveRecords: (value) => { records = clone(value); },
    rebuildFoodUsage() {},
    state: { editingRecordId: null, date: slot.date, timing: slot.timingKey },
    TIMINGS: { lunch: { label: '昼', title: '昼食' } },
    LS_KEYS: { MEAL_DRAFT: 'drafts' },
    loadDrafts: () => ({}), draftKey: () => 'draft',
    summarizeItems: () => 'sample', restoreMealItems: () => [],
    getFoodById: () => null, NUTRITION_DB: null,
    renderSyncStatus() {}, renderQuickRow() {}, renderItems() {}, renderHome() {},
    renderDiningOut() {}, loadMealFor() {}, haptic() {},
    blankDiningOut: () => ({}),
    $: () => ({ value: '' }),
    showToast: (...args) => ui.push(args), showUndoToast() {},
    dispatchEvent() {}, CustomEvent: class {},
    createClient: () => client
  };
  g.window = g;
  const context = vm.createContext(g);
  const importExpression = 'await import(SUPABASE_JS_CDN_URL)';
  assert.ok(clientSource.includes(importExpression), 'Update the CDN mock when initialization changes');
  vm.runInContext(clientSource.replace(importExpression, '({ createClient: window.createClient })'), context);
  const sb = await g.HSSupabaseReady;
  vm.runInContext(syncSource, context);

  // Run real app callers too: a resolved push immediately marks the captured ID synced.
  function appFunction(start, end) {
    const from = appSource.indexOf(start);
    const to = appSource.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `Cannot load app caller: ${start}`);
    vm.runInContext(appSource.slice(from, to), context);
  }
  appFunction('async function resendMealRecord(', '\nfunction restoreDeletedMeal(');
  appFunction('async function deleteCurrentMealRecord(', '\nfunction renderTotals(');
  appFunction('function markMealSynced(', '\n// ---------------- 食品追加');
  g.registerSbOpHandlers();
  return { g, context, q: g.HSSbQueue, sb, controls, fixtures, reads, ui };
}

test('same-millisecond queue replacement survives acknowledgement of the old entry', async () => {
  const { q, context } = await harness();
  vm.runInContext('Date.now = () => 1000', context);
  const first = q.enqueue('test', 'test:key', { version: 1 });
  const second = q.enqueue('test', 'test:key', { version: 2 });
  assert.equal(first.queuedAt, second.queuedAt);
  assert.notEqual(first.revision, second.revision);
  q.discard(first.key, first);
  assert.equal(q.load()[0].data.version, 2);
});

test('queue persistence failure throws instead of claiming the operation is saved', async () => {
  const { g, q } = await harness();
  g.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => q.enqueue('test', 'test:key', {}), /QuotaExceededError/);
  assert.equal(q.count(), 0);
});

test('pending deletion blocks resurrection by a server read', async () => {
  const { g, q } = await harness();
  q.enqueue('meal_delete', `meal_delete:${slot.date}:${slot.timingKey}`, slot);
  const counts = g.mergeServerMealRecords([meal({ synced: true })]);
  assert.equal(g.getRecords().length, 0);
  assert.equal(counts.protected, 1);
});

test('a completed local save newer than the fetch start cannot be rolled back', async () => {
  const { g } = await harness();
  g.saveRecords([meal({ synced: true, note: 'new', updatedAt: '2026-10-17T03:00:00Z' })]);
  g.mergeServerMealRecords([meal({ synced: true, note: 'old' })], {
    startedAt: Date.parse('2026-10-17T02:00:00Z')
  });
  assert.equal(g.getRecords()[0].note, 'new');
});

test('parent-only meals retain their record and authoritative nutrient totals', async () => {
  const { g } = await harness();
  const rows = g.sbRowsFromMealDetails({ meals: [{
    id: 'server-a', eaten_on: slot.date, timing: '昼',
    kcal: 420, protein_g: 20, fat_g: 10, carb_g: 60
  }], items: [], contexts: [] });
  const records = g.serverRowsToAppRecords(rows);
  assert.equal(records.length, 1);
  assert.equal(records[0].structuredItems.length, 0);
  assert.equal(records[0].kcal, 420);
  assert.equal(records[0].protein, 20);
});

test('delayed save followed by deletion is serialized and is not reported confirmed', async () => {
  const { g, sb, controls } = await harness();
  const started = deferred(), response = deferred();
  const calls = [];
  controls.saveMeal = async () => { calls.push('save'); started.resolve(); return response.promise; };
  controls.deleteMeal = async () => { calls.push('delete'); return { data: null, error: null }; };
  const record = meal();
  g.saveRecords([record]);
  const saving = g.resendMealRecord(record);
  await started.promise;
  g.state.editingRecordId = record.id;
  const deleting = g.deleteCurrentMealRecord();
  assert.equal(calls.join(','), 'save');
  response.resolve({ data: 'server-a', error: null });
  const result = await saving;
  await deleting;
  assert.notEqual(result.status, 'confirmed', 'Deleted save must not run the success/markSynced branch');
  await sb.flushQueue();
  assert.equal(calls.join(','), 'save,delete');
  assert.equal(g.getRecords().length, 0);
});

test('stale delete after Undo does not delete the restored local meal', async () => {
  const { g, controls, q } = await harness();
  let deletes = 0;
  controls.deleteMeal = async () => { deletes++; return { data: null, error: null }; };
  g.saveRecords([meal()]);
  q.enqueue('meal_delete', `meal_delete:${slot.date}:${slot.timingKey}`, slot);
  await g.pushMealDeleteToServer(slot);
  assert.equal(deletes, 0);
  assert.equal(q.count(), 0);
});

test('pagination retrieves 1001 parents and 1201 items with stable secondary ordering', async () => {
  const { sb, fixtures, reads } = await harness();
  fixtures.meals = Array.from({ length: 1001 }, (_, i) => ({ id: `meal-${i}`, eaten_on: slot.date }));
  fixtures.meal_items = Array.from({ length: 1201 }, (_, i) => ({
    id: `item-${i}`, meal_id: 'meal-0', sort_order: i
  }));
  const details = await sb.fetchMealDetails(slot.date, slot.date);
  assert.equal(details.meals.length, 1001);
  assert.equal(details.items.length, 1201);
  assert.ok(reads.some((r) => r.table === 'meals' && r.from === 1000));
  assert.ok(reads.some((r) => r.table === 'meal_items' && r.from === 1000));
  assert.deepEqual(reads.find((r) => r.table === 'meal_items').orders, ['meal_id', 'sort_order', 'id']);
  assert.ok(reads.filter((r) => r.ids).every((r) => r.ids.length <= 100));
});

test('flush excludes concurrent callers while authentication is pending', async () => {
  const { sb, controls, q } = await harness();
  const started = deferred(), session = deferred();
  let calls = 0, handled = 0;
  controls.getSession = async () => { calls++; started.resolve(); return session.promise; };
  q.enqueue('test', 'test:key', {});
  q.registerHandler('test', async () => { handled++; });
  const first = sb.flushQueue();
  await started.promise;
  assert.equal((await sb.flushQueue()).skipped, true);
  assert.equal(calls, 1);
  session.resolve({ data: { session: { user: { id: 'synthetic-user' } } }, error: null });
  await first;
  assert.equal(handled, 1);
});

test('flush skips a snapshot entry canceled by a preceding operation', async () => {
  const { sb, q } = await harness();
  q.enqueue('first', 'first', {});
  q.enqueue('second', 'second', {});
  q.registerHandler('first', async () => q.discard('second'));
  q.registerHandler('second', async () => assert.fail('Canceled operation was replayed'));
  const result = await sb.flushQueue();
  assert.equal(result.done, 1);
  assert.equal(result.failed, 0);
});

test('flush preserves a replacement queued while its old handler is awaiting a response', async () => {
  const { sb, q } = await harness();
  const started = deferred(), response = deferred();
  q.enqueue('test', 'test:key', { version: 1 });
  q.registerHandler('test', async () => { started.resolve(); await response.promise; });
  const flushing = sb.flushQueue();
  await started.promise;
  q.enqueue('test', 'test:key', { version: 2 });
  response.resolve();
  await flushing;
  assert.equal(q.count(), 1);
  assert.equal(q.load()[0].data.version, 2);
});

test('a caller holding an old ID cannot mark it synced after sending another ID', async () => {
  const { g, sb, controls } = await harness();
  const ready = deferred();
  const old = meal();
  g.saveRecords([old]);
  g.HSSupabaseReady = ready.promise;
  const sending = g.resendMealRecord(old);
  const replacement = meal({ id: 'local-b', memo: 'replacement' });
  g.saveRecords([old, replacement]);
  let sent = 0;
  controls.saveMeal = async () => { sent++; return { data: 'server-a', error: null }; };
  ready.resolve(sb);
  const result = await sending;
  assert.notEqual(result.status, 'confirmed');
  assert.equal(sent, 0, 'Old caller must not send a different local record');
  assert.equal(g.getRecords().find((r) => r.id === old.id).synced, false);
});

test('editing the same ID during a delayed save cannot mark its newer contents synced', async () => {
  const { g, controls, sb } = await harness();
  const started = deferred(), response = deferred();
  const sent = [];
  controls.saveMeal = async (payload) => {
    sent.push(payload.p_memo);
    if (sent.length === 1) { started.resolve(); return response.promise; }
    return { data: 'server-a', error: null };
  };
  const old = meal();
  g.saveRecords([old]);
  const sending = g.resendMealRecord(old);
  await started.promise;
  g.saveRecords([meal({ memo: 'new', updatedAt: '2026-10-17T02:00:00Z' })]);
  response.resolve({ data: 'server-a', error: null });
  assert.notEqual((await sending).status, 'confirmed');
  assert.equal(g.getRecords()[0].synced, false);
  await sb.flushQueue();
  assert.equal(sent.join(','), 'sample,new');
  assert.equal(g.getRecords()[0].synced, true);
});

test('late failure of an old save cannot erase or reverse a newer failed deletion', async () => {
  const { g, sb, q, controls } = await harness();
  const started = deferred(), response = deferred();
  const calls = [];
  let deletingOffline = true;
  controls.saveMeal = async () => { calls.push('save'); started.resolve(); return response.promise; };
  controls.deleteMeal = async () => {
    calls.push('delete');
    return deletingOffline ? { data: null, error: { message: 'offline' } } : { data: null, error: null };
  };
  const old = meal();
  g.saveRecords([old]);
  const saving = g.resendMealRecord(old);
  await started.promise;
  g.state.editingRecordId = old.id;
  const deleting = g.deleteCurrentMealRecord();
  response.resolve({ data: null, error: { message: 'late save failure' } });
  await Promise.all([saving, deleting]);
  assert.ok(q.load().some((entry) => entry.op === 'meal_delete'));
  // Reproduce an obsolete caller's failure callback arriving after the delete was queued.
  g.queueWithToast('meal_save', `meal_save:${slot.date}:${slot.timingKey}`, slot, 'meal', new Error('late failure'));
  assert.ok(q.load().some((entry) => entry.op === 'meal_delete'));
  g.mergeServerMealRecords([meal({ synced: true })]);
  assert.equal(g.getRecords().length, 0);
  deletingOffline = false;
  await sb.flushQueue();
  assert.equal(calls.filter((call) => call === 'save').length, 1);
  assert.equal(q.count(), 0);
  assert.equal(g.getRecords().length, 0);
});

test('repeated failed meal-save flushes retain revision and increment poison attempts', async () => {
  const { g, sb, q, controls } = await harness();
  g.saveRecords([meal()]);
  const entry = q.enqueue('meal_save', `meal_save:${slot.date}:${slot.timingKey}`, slot);
  controls.saveMeal = async () => ({ data: null, error: { message: 'synthetic permanent save failure' } });
  assert.equal((await sb.flushQueue()).failed, 1);
  assert.equal(q.load()[0].revision, entry.revision);
  assert.equal(q.load()[0].attempts, 1);
  assert.equal((await sb.flushQueue()).failed, 1);
  assert.equal(q.load()[0].revision, entry.revision);
  assert.equal(q.load()[0].attempts, 2);
  assert.match(q.load()[0].lastError, /permanent save failure/);
  controls.saveMeal = async () => ({ data: 'server-a', error: null });
  assert.equal((await sb.flushQueue()).done, 1);
  assert.equal(q.count(), 0);
  assert.equal(g.getRecords()[0].synced, true);
});

test('repeated failed meal-delete flushes also retain poison attempts', async () => {
  const { sb, q, controls } = await harness();
  const entry = q.enqueue('meal_delete', `meal_delete:${slot.date}:${slot.timingKey}`, slot);
  controls.deleteMeal = async () => ({ data: null, error: { message: 'synthetic permanent delete failure' } });
  await sb.flushQueue();
  await sb.flushQueue();
  assert.equal(q.load()[0].revision, entry.revision);
  assert.equal(q.load()[0].attempts, 2);
  assert.match(q.load()[0].lastError, /permanent delete failure/);
});

test('a failure from an obsolete flush does not attach poison metadata to its replacement', async () => {
  const { g, sb, q, controls } = await harness();
  const started = deferred(), response = deferred();
  g.saveRecords([meal()]);
  q.enqueue('meal_save', `meal_save:${slot.date}:${slot.timingKey}`, slot);
  controls.saveMeal = async () => { started.resolve(); return response.promise; };
  const flushing = sb.flushQueue();
  await started.promise;
  const replacement = q.enqueue('meal_save', `meal_save:${slot.date}:${slot.timingKey}`, slot);
  response.resolve({ data: null, error: { message: 'obsolete failure' } });
  await flushing;
  assert.equal(q.load()[0].revision, replacement.revision);
  assert.equal(q.load()[0].attempts, undefined);
  assert.equal(q.load()[0].lastError, undefined);
});

test('MEAL_SUPERSEDED callbacks do not enqueue a save after a newer deletion', async () => {
  const { g, q } = await harness();
  const entry = q.enqueue('meal_delete', `meal_delete:${slot.date}:${slot.timingKey}`, slot);
  let error;
  try { await g.pushMealToServer(meal()); } catch (caught) { error = caught; }
  assert.equal(error.code, 'MEAL_SUPERSEDED');
  g.queueWithToast('meal_save', `meal_save:${slot.date}:${slot.timingKey}`, slot, 'meal', error);
  assert.equal(q.count(), 1);
  assert.equal(q.load()[0].revision, entry.revision);
  assert.equal(q.load()[0].op, 'meal_delete');
});

test('a delayed delete failing after Undo is classified as superseded, not a new delete intent', async () => {
  const { g, controls } = await harness();
  const started = deferred(), response = deferred();
  controls.deleteMeal = async () => { started.resolve(); return response.promise; };
  const deleting = g.pushMealDeleteToServer(slot);
  const failure = assert.rejects(deleting, (error) => error.code === 'MEAL_SUPERSEDED');
  await started.promise;
  g.saveRecords([meal({ updatedAt: '2026-10-17T04:00:00Z' })]);
  response.resolve({ data: null, error: { message: 'obsolete delete failure' } });
  await failure;
});
