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

function getPlan() {
  return [
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
    }
  ];
}

async function readCollectionIndexes(db, collectionName) {
  const collection = db.collection(collectionName);
  try {
    return await collection.indexes();
  } catch (err) {
    const namespaceMissing = err && (err.code === 26 || err.codeName === 'NamespaceNotFound');
    if (namespaceMissing) {
      return [];
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
    const plan = getPlan();
    const missing = [];
    let requiredCount = 0;

    for (const item of plan) {
      const indexes = await readCollectionIndexes(db, item.collection);
      for (const expect of item.indexes) {
        requiredCount += 1;
        const expectedUnique = Boolean(expect.options && expect.options.unique);
        const matched = indexes.find(index => {
          const sameUnique = Boolean(index.unique) === expectedUnique;
          return sameUnique && isSameKey(index.key, expect.keys);
        });
        if (!matched) {
          missing.push({
            collection: item.collection,
            keys: expect.keys,
            unique: expectedUnique,
            name: expect.options && expect.options.name
          });
        }
      }
    }

    const foundCount = requiredCount - missing.length;
    console.log(
      JSON.stringify(
        {
          title: 'db.indexes',
          ok: missing.length === 0,
          requiredCount,
          foundCount,
          missing
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('[check-indexes] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
