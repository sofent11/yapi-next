#!/usr/bin/env node

const { MongoClient } = require('mongodb');

function parseDbName(mongoUrl) {
  try {
    const parsed = new URL(mongoUrl);
    const pathname = parsed.pathname.replace(/^\//, '');
    return pathname || 'yapi';
  } catch (_err) {
    return 'yapi';
  }
}

function isSameKey(existingKey, desiredKey) {
  const existingEntries = Object.entries(existingKey || {});
  const desiredEntries = Object.entries(desiredKey || {});
  if (existingEntries.length !== desiredEntries.length) return false;
  for (let i = 0; i < existingEntries.length; i++) {
    const [existingName, existingOrder] = existingEntries[i];
    const [desiredName, desiredOrder] = desiredEntries[i];
    if (existingName !== desiredName || Number(existingOrder) !== Number(desiredOrder)) {
      return false;
    }
  }
  return true;
}

async function ensureIndex(db, collectionName, keys, options) {
  const collection = db.collection(collectionName);
  let existingIndexes = [];
  try {
    existingIndexes = await collection.indexes();
  } catch (err) {
    const namespaceMissing = err && (err.code === 26 || err.codeName === 'NamespaceNotFound');
    if (!namespaceMissing) {
      throw err;
    }
  }
  const requiredUnique = Boolean(options && options.unique);
  const matched = existingIndexes.find(index => {
    const sameUnique = Boolean(index.unique) === requiredUnique;
    return sameUnique && isSameKey(index.key, keys);
  });
  if (matched) {
    console.log(`[skip] ${collectionName}.${matched.name}`);
    return;
  }

  try {
    const indexName = await collection.createIndex(keys, options);
    console.log(`[ok] ${collectionName}.${indexName}`);
  } catch (err) {
    const conflict =
      err &&
      (err.codeName === 'IndexOptionsConflict' ||
        err.codeName === 'IndexKeySpecsConflict' ||
        err.code === 85 ||
        err.code === 86);
    if (conflict) {
      console.warn(`[warn] ${collectionName} index conflict: ${JSON.stringify(keys)} ${err.message}`);
      return;
    }
    throw err;
  }
}

async function main() {
  const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/yapi';
  const dbName = process.env.MONGO_DB || parseDbName(mongoUrl);
  const client = new MongoClient(mongoUrl, {
    maxPoolSize: 5
  });

  try {
    await client.connect();
    const db = client.db(dbName);

    const plan = [
      {
        collection: 'interface',
        indexes: [
          {
            keys: { project_id: 1, path: 1, method: 1 },
            options: { name: 'uniq_project_path_method', unique: true }
          },
          {
            keys: { project_id: 1, catid: 1, index: 1 },
            options: { name: 'idx_project_cat_index' }
          },
          {
            keys: { project_id: 1, type: 1, method: 1 },
            options: { name: 'idx_project_type_method' }
          },
          {
            keys: { project_id: 1, status: 1, tag: 1, index: 1 },
            options: { name: 'idx_project_status_tag_index' }
          },
          {
            keys: { 'query_path.path': 1, project_id: 1, method: 1 },
            options: { name: 'idx_querypath_project_method' }
          }
        ]
      },
      {
        collection: 'token',
        indexes: [
          {
            keys: { token: 1 },
            options: { name: 'uniq_token', unique: true }
          },
          {
            keys: { project_id: 1 },
            options: { name: 'uniq_project_token', unique: true }
          }
        ]
      },
      {
        collection: 'follow',
        indexes: [
          {
            keys: { uid: 1, projectid: 1 },
            options: { name: 'uniq_uid_projectid', unique: true }
          }
        ]
      },
      {
        collection: 'spec_import_task',
        indexes: [
          {
            keys: { project_id: 1, add_time: -1 },
            options: { name: 'idx_project_add_time' }
          },
          {
            keys: { status: 1, up_time: -1 },
            options: { name: 'idx_status_up_time' }
          }
        ]
      }
    ];

    for (const entry of plan) {
      for (const index of entry.indexes) {
        await ensureIndex(db, entry.collection, index.keys, index.options);
      }
    }

    console.log(`[done] index migration finished for db=${dbName}`);
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error(`[fatal] ${err.stack || err.message}`);
  process.exit(1);
});
