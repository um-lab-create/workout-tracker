#!/usr/bin/env node
'use strict';

// Dependency-free, network-free tests of the browser script with Web Storage failure atomicity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');

function harness(initial = {}, capacity = Infinity) {
  const data = new Map(Object.entries(initial));
  const calls = [], warnings = [];
  const controls = { capacity, beforeGet() {}, beforeSet() {}, beforeRemove() {} };
  const localStorage = {
    getItem(key) {
      key = String(key);
      calls.push(['get', key]);
      controls.beforeGet(key);
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      key = String(key);
      value = String(value);
      calls.push(['set', key, value]);
      controls.beforeSet(key, value);
      const next = new Map(data).set(key, value);
      const size = [...next].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
      if (size > controls.capacity) throw quotaError();
      data.set(key, value);
    },
    removeItem(key) {
      key = String(key);
      calls.push(['remove', key]);
      controls.beforeRemove(key);
      data.delete(key);
    }
  };
  const context = vm.createContext({ localStorage, console: { warn: (...args) => warnings.push(args) } });
  vm.runInContext(source, context, { filename: 'js/storage.js' });
  return { api: context, data, calls, warnings, controls, localStorage, context };
}

function quotaError() {
  return Object.assign(new Error('Synthetic quota failure'), { name: 'QuotaExceededError', code: 22 });
}

function expectFailure(fn, code, cause) {
  return assert.throws(fn, (error) => {
    assert.equal(error.code, code);
    assert.ok(error.message.length > 20, 'Show an actionable user-facing message');
    if (cause !== undefined) assert.equal(error.cause, cause);
    return true;
  });
}

test('required save returns success only after JSON is persisted', () => {
  const { api, data, controls } = harness({ record: 'old' });
  let returned = false;
  controls.beforeSet = () => assert.equal(returned, false);
  assert.equal(api.lsSetRequired('record', { version: 2 }), true);
  returned = true;
  assert.equal(data.get('record'), '{"version":2}');
  controls.beforeSet = () => {};
  for (const value of [null, false, 0, '', [1, 2]]) {
    assert.equal(api.lsSetRequired('record', value), true);
    assert.equal(data.get('record'), JSON.stringify(value));
  }
});

test('best-effort cache writes still swallow quota and serialization failures', () => {
  const { api, data, warnings } = harness({ cache: 'old' }, 8);
  assert.doesNotThrow(() => api.lsSet('cache', 'too large'));
  const cyclic = {}; cyclic.self = cyclic;
  assert.doesNotThrow(() => api.lsSet('cache', cyclic));
  assert.equal(data.get('cache'), 'old');
  assert.equal(warnings.length, 2);
});

test('quota failures preserve existing records and unrelated data', () => {
  const initial = { record: '{"version":1}', unrelated: 'keep' };
  const { api, data } = harness(initial, 38);
  expectFailure(() => api.lsSetRequired('record', 'x'.repeat(100)), 'STORAGE_QUOTA_EXCEEDED');
  expectFailure(() => api.lsSetRequired('new', 'x'.repeat(100)), 'STORAGE_QUOTA_EXCEEDED');
  assert.deepEqual(Object.fromEntries(data), initial);
});

test('modern and legacy quota exceptions are classified without leaking their messages', () => {
  for (const cause of [quotaError(), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }, { code: 22 }, { code: 1014 }]) {
    const { api, controls, data } = harness({ record: 'old' });
    controls.beforeSet = () => { throw cause; };
    expectFailure(() => api.lsSetRequired('record', 2), 'STORAGE_QUOTA_EXCEEDED', cause);
    assert.equal(data.get('record'), 'old');
  }
});

test('generic setItem and storage access failures throw and preserve old data', () => {
  const { api, controls, data, context } = harness({ record: 'old' });
  const cause = new Error('Synthetic blocked storage');
  controls.beforeSet = () => { throw cause; };
  expectFailure(() => api.lsSetRequired('record', 2), 'STORAGE_WRITE_FAILED', cause);
  delete context.localStorage;
  expectFailure(() => api.lsSetRequired('record', 2), 'STORAGE_WRITE_FAILED');
  assert.equal(data.get('record'), 'old');
});

test('cyclic, BigInt, throwing toJSON and JSON-less values never touch storage', () => {
  const cyclic = {}; cyclic.self = cyclic;
  const cause = new Error('Synthetic serialization failure');
  const invalid = [cyclic, 1n, undefined, () => {}, Symbol('value'),
    { toJSON() { throw cause; } }, { toJSON() { return undefined; } }];
  for (const value of invalid) {
    const { api, data, calls } = harness({ record: 'old' });
    expectFailure(() => api.lsSetRequired('record', value), 'STORAGE_SERIALIZE_FAILED');
    assert.equal(data.get('record'), 'old');
    assert.equal(calls.length, 0);
  }
  const { api } = harness();
  expectFailure(() => api.lsSetRequired('record', invalid[5]), 'STORAGE_SERIALIZE_FAILED', cause);
});

test('read defaults and best-effort removal remain compatible', () => {
  const { api, controls } = harness({ valid: 'false', broken: 'not JSON' });
  assert.equal(api.lsGet('valid', true), false);
  assert.equal(api.lsGet('broken', 'fallback'), 'fallback');
  assert.equal(api.lsGet('missing', 'fallback'), 'fallback');
  controls.beforeGet = () => { throw new Error('blocked'); };
  assert.equal(api.lsGet('valid', 'fallback'), 'fallback');
  controls.beforeRemove = () => { throw new Error('blocked'); };
  assert.doesNotThrow(() => api.lsRemove('valid'));
});

test('batch saves every key and takes all snapshots before writing', () => {
  const { api, data, calls } = harness({ a: 'old', untouched: 'keep' });
  assert.equal(api.lsSetManyRequired([['a', { v: 2 }], ['b', []]]), true);
  assert.deepEqual(calls.map((call) => call[0]), ['get', 'get', 'set', 'set']);
  assert.deepEqual(Object.fromEntries(data), { a: '{"v":2}', untouched: 'keep', b: '[]' });
  assert.equal(api.lsSetManyRequired([]), true);
});

test('batch serialization failure occurs before any storage reads or writes', () => {
  const { api, data, calls } = harness({ a: 'old' });
  expectFailure(() => api.lsSetManyRequired([['a', 2], ['b', 1n]]), 'STORAGE_SERIALIZE_FAILED');
  assert.equal(calls.length, 0);
  assert.deepEqual(Object.fromEntries(data), { a: 'old' });
});

test('batch rejects ambiguous input and duplicate keys before touching storage', () => {
  for (const entries of [{ a: 2 }, [['a', 2], ['a', 3]], [[1, 2]], [['a']], [null]]) {
    const { api, calls } = harness();
    assert.throws(() => api.lsSetManyRequired(entries), { name: 'TypeError' });
    assert.equal(calls.length, 0);
  }
});

test('snapshot failure cannot partially update an earlier key', () => {
  const initial = { a: 'old', b: 'old-b' };
  const { api, data, controls, calls } = harness(initial);
  const cause = new Error('Synthetic read failure');
  controls.beforeGet = (key) => { if (key === 'b') throw cause; };
  expectFailure(() => api.lsSetManyRequired([['a', 2], ['b', 3]]), 'STORAGE_READ_FAILED', cause);
  assert.ok(calls.every((call) => call[0] === 'get'));
  assert.deepEqual(Object.fromEntries(data), initial);
});

test('batch quota failure restores exact old strings, empty strings and absent keys', () => {
  const initial = { a: ' { "old": true } ', empty: '', unrelated: 'keep' };
  const { api, data, calls } = harness(initial, 90);
  expectFailure(() => api.lsSetManyRequired([
    ['a', 1], ['empty', 2], ['new', 3], ['last', 'x'.repeat(100)]
  ]), 'STORAGE_QUOTA_EXCEEDED');
  assert.deepEqual(Object.fromEntries(data), initial);
  assert.deepEqual(calls.slice(-3), [['remove', 'new'], ['set', 'empty', ''], ['set', 'a', initial.a]]);
});

test('a failure at each batch write position restores the original data', () => {
  const entries = [['a', 1], ['b', 2], ['new', 3]];
  for (const [failedKey] of entries) {
    const initial = { a: 'old-a', b: 'old-b', untouched: 'keep' };
    const { api, data, controls } = harness(initial);
    const cause = new Error('Synthetic set failure');
    controls.beforeSet = (key) => { if (key === failedKey) throw cause; };
    expectFailure(() => api.lsSetManyRequired(entries), 'STORAGE_WRITE_FAILED', cause);
    assert.deepEqual(Object.fromEntries(data), initial);
  }
});

test('rollback failure is explicit and does not prevent restoration of other keys', () => {
  const { api, data, controls } = harness({ a: 'old-a', b: 'old-b', last: 'old-last' });
  const cause = quotaError();
  const restoreCause = new Error('Synthetic restore failure');
  controls.beforeSet = (key, value) => {
    if (key === 'last') throw cause;
    if (key === 'b' && value === 'old-b') throw restoreCause;
  };
  assert.throws(() => api.lsSetManyRequired([['a', 1], ['b', 2], ['last', 3]]), (error) => {
    assert.equal(error.code, 'STORAGE_ROLLBACK_FAILED');
    assert.equal(error.cause, cause);
    assert.equal(error.rollbackErrors.length, 1);
    assert.equal(error.rollbackErrors[0].key, 'b');
    assert.equal(error.rollbackErrors[0].error, restoreCause);
    return true;
  });
  assert.equal(data.get('a'), 'old-a');
  assert.equal(data.get('b'), '2');
  assert.equal(data.get('last'), 'old-last');
});

test('failure to remove a newly written key during rollback is reported', () => {
  const { api, data, controls } = harness();
  const cause = new Error('Synthetic remove failure');
  controls.beforeSet = (key) => { if (key === 'last') throw quotaError(); };
  controls.beforeRemove = () => { throw cause; };
  assert.throws(() => api.lsSetManyRequired([['new', 1], ['last', 2]]), (error) => {
    assert.equal(error.code, 'STORAGE_ROLLBACK_FAILED');
    assert.equal(error.rollbackErrors[0].error, cause);
    return true;
  });
  assert.equal(data.get('new'), '1');
  assert.equal(data.has('last'), false);
});
