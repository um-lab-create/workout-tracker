#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'health-import.html'), 'utf8');
const code = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).join('\n');
const elements = new Map();
const element = (selector) => {
  if (!elements.has(selector)) elements.set(selector, {
    disabled: false, textContent: '', innerHTML: '', value: '', style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}
  });
  return elements.get(selector);
};
const context = vm.createContext({
  console: { ...console, error() {} }, TextDecoder, performance: { now: () => 0 },
  setTimeout: () => 0, clearTimeout() {},
  navigator: { onLine: true }, document: { querySelector: element },
  window: { addEventListener() {} }
});
vm.runInContext(code, context);
const run = (source) => vm.runInContext(source, context);

(async () => {
  let finish;
  let writes = 0;
  context.window.HSSupabaseReady = Promise.resolve({
    getSession: async () => ({ user: { id: 'test' } }),
    upsertHealthMetrics: async (rows) => {
      writes++;
      assert.equal(rows.length, 1);
      return new Promise((resolve) => { finish = resolve; });
    }
  });
  run("state.file = {}; state.rows = [{'日付':'2026-10-17','ステップ数':100}]");
  const sending = run('sendRows()');
  await new Promise(setImmediate);
  for (const id of ['#zipInput', '#resetBtn', '#parseBtn', '#sendBtn']) {
    assert.equal(element(id).disabled, true, id + ' must be locked during sending');
  }
  await run('sendRows()');
  assert.equal(writes, 1, 'a second tap must not send another request');
  finish({ total: 1 });
  await sending;
  assert.equal(run('state.sent'), true);
  assert.equal(element('#zipInput').disabled, false);
  assert.equal(element('#sendBtn').disabled, true);
  console.log('PASS: sending locks file/reset/parse and blocks double submission');

  run('resetResult(); state.rows = [{"日付":"2026-10-17","ステップ数":100}]');
  context.window.HSSupabaseReady = Promise.resolve({
    getSession: async () => ({ user: { id: 'test' } }),
    upsertHealthMetrics: async () => { throw new Error('connection interrupted'); }
  });
  await run('sendRows()');
  assert.equal(run('state.rows.length'), 1);
  assert.equal(run('state.sent'), false);
  assert.equal(element('#sendBtn').disabled, false);
  assert.equal(element('#resetBtn').disabled, false);
  console.log('PASS: failure keeps parsed rows and enables retry');

  context.window.HSSupabaseReady = Promise.resolve({ getSession: async () => null });
  await run('sendRows()');
  assert.equal(run('state.sending'), false);
  assert.equal(element('#sendBtn').disabled, false);
  console.log('PASS: missing login releases controls without discarding rows');

  let finishZip;
  let parses = 0;
  context.window.JSZip = context.JSZip = {
    loadAsync: () => {
      parses++;
      return new Promise((resolve) => { finishZip = resolve; });
    }
  };
  const parsing = run('parseSelectedZip()');
  assert.equal(element('#zipInput').disabled, true);
  assert.equal(element('#resetBtn').disabled, true);
  await run('parseSelectedZip()');
  assert.equal(parses, 1);
  finishZip({ file: () => null });
  await parsing;
  assert.equal(run('state.parsing'), false);
  assert.equal(element('#zipInput').disabled, false);
  assert.equal(element('#parseBtn').disabled, false);
  assert.equal(element('#sendBtn').disabled, true);
  console.log('PASS: parsing blocks concurrent reset/parse and recovers from invalid ZIP');

  const dateAttrs = 'creationDate="2026-10-17 09:00:00 +0900" startDate="2026-10-17 01:00:00 +0900" endDate="2026-10-17 09:00:00 +0900" sourceName="Apple Watch"';
  context.inBed = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisInBed" ${dateAttrs}/>`;
  const sleepRow = run('(() => { const a=createAggregate(); ingestRecordTag(inBed,a); return finalizeRows(a)[0]; })()');
  assert.equal(sleepRow['ベッド時間(hr)'], 8);
  assert.equal(sleepRow['睡眠合計(hr)'], '');
  assert.equal(sleepRow['睡眠中(hr)'], '');
  context.core = `<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" ${dateAttrs}/>`;
  const coreRow = run('(() => { const a=createAggregate(); ingestRecordTag(core,a); return finalizeRows(a)[0]; })()');
  assert.equal(coreRow['コア睡眠(hr)'], 8);
  assert.equal(coreRow['深い睡眠(hr)'], '');
  assert.equal(coreRow['ベッド時間(hr)'], '');
  assert.equal(run('buildMetricRows([buildRow("2026-10-17", ensureDay(createAggregate(), "2026-10-17"))]).length'), 0);
  console.log('PASS: measured sleep is retained; missing stages do not overwrite existing metrics with zero');

  for (const [unit, value, expected] of [['kJ', 100, 100], ['kcal', 100, 418], ['J', 100000, 100]]) {
    context.energy = `<Record type="HKQuantityTypeIdentifierActiveEnergyBurned" value="${value}" unit="${unit}" ${dateAttrs}/>`;
    const total = run('(() => { const a=createAggregate(); ingestRecordTag(energy,a); return finalizeRows(a)[0]["アクティブエネルギー(kJ)"]; })()');
    assert.equal(total, expected);
  }
  console.log('PASS: active energy respects kcal/kJ/J source units');

  const steps = `<Record type="HKQuantityTypeIdentifierStepCount" value="100" unit="count" ${dateAttrs}/>`;
  const streamEntry = (text) => ({
    _data: { uncompressedSize: text.length },
    internalStream: () => {
      const events = {};
      const stream = {
        on(name, fn) { events[name] = fn; return stream; },
        pause() {},
        resume() {
          const bytes = new TextEncoder().encode(text);
          // Exercise Record/root tags split between arbitrary UTF-8 chunks.
          for (let i=0; i<bytes.length; i+=17) events.data(bytes.slice(i, i+17));
          events.end();
        }
      };
      return stream;
    }
  });
  for (const xml of [`<HealthData>${steps}<Record type="broken"`, `<HealthData>${steps}`]) {
    context.entry = streamEntry(xml);
    await assert.rejects(run('streamExportXml(entry, createAggregate())'), /途中で切れています/);
  }
  context.entry = streamEntry(`<HealthData>${steps}</HealthData>\n`);
  await run('streamExportXml(entry, createAggregate())');
  console.log('PASS: truncated Record/root rejects partial import; a complete chunked export succeeds');
})().catch((error) => { console.error(error); process.exitCode = 1; });
