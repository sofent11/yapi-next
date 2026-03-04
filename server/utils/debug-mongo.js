const mongoose = require('mongoose');
const yapi = require('../yapi');

// Safe stringify to avoid huge/unsafe payloads
function safe(value, depth = 0) {
  const MAX_DEPTH = 3;
  const MAX_LEN = 2000;
  try {
    if (value == null) return value;
    if (Buffer.isBuffer(value)) return `<Buffer ${value.length} bytes>`;
    if (Array.isArray(value)) {
      if (depth >= MAX_DEPTH) return `[Array(${value.length})]`;
      return value.map(v => safe(v, depth + 1));
    }
    if (typeof value === 'object') {
      if (depth >= MAX_DEPTH) return '{…}';
      const out = {};
      for (const k of Object.keys(value)) {
        if (k === 'password' || k === 'pass' || k === 'authorization' || k === 'Authorization') continue;
        out[k] = safe(value[k], depth + 1);
      }
      return out;
    }
    if (typeof value === 'string') {
      return value.length > MAX_LEN ? value.slice(0, MAX_LEN) + `…(${value.length} chars)` : value;
    }
    return value;
  } catch (e) {
    return `<Unserializable ${typeof value}>`;
  }
}

function log(level, msg, extra) {
  const line = extra ? `${msg} | ${JSON.stringify(safe(extra))}` : msg;
  yapi.commons && yapi.commons.log ? yapi.commons.log(line, level) : console[level === 'error' ? 'error' : 'log'](line);
}

function attachMongooseDebug() {
  try {
    mongoose.set('debug', function (collectionName, method, query, doc, options) {
      // Keep concise but informative
      log('log', `[Mongoose] ${collectionName}.${method}`, {
        query, doc, options
      });
    });
  } catch (e) {
    log('error', '[Mongoose] set debug failed', { error: e && e.stack || String(e) });
  }
}

function attachDriverCommandEvents(conn) {
  try {
    const client = (typeof conn.getClient === 'function') ? conn.getClient() : (conn.client || null);
    if (!client || !client.on) return;

    client.on('commandStarted', ev => {
      // ev.commandName, ev.databaseName, ev.command
      const ns = ev && ev.databaseName && ev.command && (ev.command[ev.commandName] || ev.command.collection)
        ? `${ev.databaseName}.${ev.command[ev.commandName] || ev.command.collection}`
        : ev && ev.databaseName ? `${ev.databaseName}` : 'unknown';
      log('log', `[MongoCmd] started ${ev.commandName} ${ns}`, safe({ command: ev.command }));
    });

    client.on('commandFailed', ev => {
      const ns = ev && ev.databaseName && ev.command && (ev.command[ev.commandName] || ev.command.collection)
        ? `${ev.databaseName}.${ev.command[ev.commandName] || ev.command.collection}`
        : ev && ev.databaseName ? `${ev.databaseName}` : 'unknown';
      log('error', `[MongoCmd] failed ${ev.commandName} ${ns}`, safe({
        command: ev.command,
        failure: ev.failure && (ev.failure.stack || ev.failure.message || String(ev.failure)),
        duration: ev.duration
      }));
    });

    client.on('commandSucceeded', ev => {
      const ns = ev && ev.databaseName && ev.reply && (ev.reply.ns || ev.reply.collection)
        ? `${ev.databaseName}.${ev.reply.ns || ev.reply.collection}`
        : ev && ev.databaseName ? `${ev.databaseName}` : 'unknown';
      log('log', `[MongoCmd] ok ${ev.commandName} ${ns}`, { duration: ev.duration });
    });
  } catch (e) {
    log('error', '[MongoCmd] attach events failed', { error: e && e.stack || String(e) });
  }
}

function attachConnectionError(conn) {
  try {
    conn.on('error', err => {
      log('error', '[Mongoose] connection error', { error: err && (err.stack || err.message || String(err)) });
    });
    conn.on('timeout', err => {
      log('error', '[Mongoose] connection timeout', { error: err && (err.stack || err.message || String(err)) });
    });
    conn.on('disconnected', () => log('error', '[Mongoose] disconnected'));
    conn.on('reconnectFailed', () => log('error', '[Mongoose] reconnect failed'));
  } catch (e) {
    log('error', '[Mongoose] attach conn events failed', { error: e && e.stack || String(e) });
  }
}

module.exports = function initMongoDebug(conn) {
  attachMongooseDebug();
  if (conn) {
    attachConnectionError(conn);
    attachDriverCommandEvents(conn);
  } else if (mongoose.connection && mongoose.connection.readyState) {
    attachConnectionError(mongoose.connection);
    attachDriverCommandEvents(mongoose.connection);
  }
};

