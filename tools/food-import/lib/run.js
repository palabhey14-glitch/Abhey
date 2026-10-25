// Runs one import: batches rows into the sink, saves a checkpoint after each
// batch so an interrupted import resumes where it stopped, and (optionally)
// retires foods the finished run no longer saw, so refreshes stay current.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function loadState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2));
  fs.renameSync(file + '.tmp', file);
}

async function runImport({ source, dataset, versionPrefix, countries, open, sink, stateFile, resume, retireMissing, batchSize = 500, limit, log = console.log }) {
  let state = resume ? loadState(stateFile) : null;
  if (resume && (!state || state.done)) {
    log(state ? 'Last run finished; starting a fresh run.' : 'No saved run to resume; starting fresh.');
    state = null;
  }
  if (!state) {
    const started = new Date().toISOString();
    state = { source, dataset, tag: `${source}-${dataset || 'all'}-${started.replace(/[:.]/g, '-')}`, started_at: started, cursor: null, upserted: 0, skipped: 0, done: false };
    saveState(stateFile, state);
    await sink.startRun({ source, tag: state.tag, dataset: dataset || null, mode: 'full' });
  } else {
    log(`Resuming ${state.tag} after ${state.upserted} rows.`);
    await sink.updateRun(state.tag, { status: 'running', mode: 'resume' });
  }

  let batch = [];
  let lastCursor = state.cursor;
  const flush = async () => {
    if (batch.length) await sink.upsert(batch);
    state.upserted += batch.length;
    state.cursor = lastCursor;
    batch = [];
    saveState(stateFile, state);
    await sink.updateRun(state.tag, { cursor: state.cursor, rows_upserted: state.upserted });
  };

  try {
    for await (const { row, cursor } of open(state.cursor)) {
      lastCursor = cursor;
      if (!row) continue;
      row.import_tag = state.tag;
      row.last_seen_at = state.started_at;
      batch.push(row);
      if (batch.length >= batchSize) {
        await flush();
        log(`  ${state.upserted} rows`);
      }
      if (limit && state.upserted + batch.length >= limit) break;
    }
    await flush();
  } catch (err) {
    await sink.updateRun(state.tag, { status: 'failed', error: String(err.message || err).slice(0, 1000) });
    sink.close();
    err.message = `${err.message}\nProgress is saved: run the same command with --resume to continue.`;
    throw err;
  }

  let retired = 0;
  if (retireMissing && !limit) retired = (await sink.retire({ source, versionPrefix, before: state.started_at, countries })) || 0;
  state.done = true;
  saveState(stateFile, state);
  await sink.updateRun(state.tag, { status: 'done', finished_at: new Date().toISOString(), rows_retired: retired });
  sink.close();
  return { tag: state.tag, upserted: state.upserted, retired };
}

module.exports = { runImport, loadState, saveState };
