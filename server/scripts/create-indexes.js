const mongoose = require('mongoose');

function getConfig() {
  try {
    return require('../../config.json');
  } catch (e) {
    return require('../../config_example.json');
  }
}

function buildConnectString(config) {
  if (config.db.connectString) return config.db.connectString;
  let connectString = `mongodb://${config.db.servername}:${config.db.port}/${config.db.DATABASE}`;
  if (config.db.authSource) {
    connectString += `?authSource=${encodeURIComponent(config.db.authSource)}`;
  }
  if (config.db.options && typeof config.db.options.loadBalanced !== 'undefined') {
    const lb = config.db.options.loadBalanced ? 'true' : 'false';
    connectString += (connectString.includes('?') ? '&' : '?') + `loadBalanced=${lb}`;
  }
  return connectString;
}

function sanitizeOptions(config) {
  const options = Object.assign({}, config.db.options || {});
  if (config.db.user) {
    options.user = config.db.user;
    options.pass = config.db.pass;
  }
  if (options.poolSize != null) {
    options.maxPoolSize = options.poolSize;
    delete options.poolSize;
  }
  [
    'useNewUrlParser',
    'useUnifiedTopology',
    'useCreateIndex',
    'useFindAndModify',
    'reconnectTries',
    'reconnectInterval',
    'loadBalanced'
  ].forEach(k => delete options[k]);
  return options;
}

async function safeCreateIndex(collection, keys, options) {
  try {
    const result = await collection.createIndex(keys, options);
    console.log(`[index] created ${collection.collectionName}.${result}`);
    return result;
  } catch (err) {
    if (err && err.code === 11000) {
      console.warn(`[index] skip duplicate data for unique index ${collection.collectionName}`, err.message);
      return null;
    }
    if (err && /already exists/i.test(err.message || '')) {
      console.log(`[index] exists ${collection.collectionName}.${options && options.name}`);
      return null;
    }
    throw err;
  }
}

async function run() {
  const config = getConfig();
  const connectString = buildConnectString(config);
  const options = sanitizeOptions(config);
  await mongoose.connect(connectString, options);
  const db = mongoose.connection.db;

  const interfaceCollection = db.collection('interface');
  await safeCreateIndex(interfaceCollection, { project_id: 1, path: 1, method: 1 }, {
    unique: true,
    name: 'uniq_project_path_method'
  });
  await safeCreateIndex(interfaceCollection, { project_id: 1, catid: 1, index: 1 }, {
    name: 'idx_project_cat_index'
  });
  await safeCreateIndex(interfaceCollection, { project_id: 1, type: 1, method: 1 }, {
    name: 'idx_project_type_method'
  });
  await safeCreateIndex(interfaceCollection, { project_id: 1, status: 1, tag: 1, index: 1 }, {
    name: 'idx_project_status_tag_index'
  });
  await safeCreateIndex(interfaceCollection, { 'query_path.path': 1, project_id: 1, method: 1 }, {
    name: 'idx_query_path_project_method'
  });

  const tokenCollection = db.collection('token');
  await safeCreateIndex(tokenCollection, { token: 1 }, { unique: true, name: 'uniq_token' });
  await safeCreateIndex(tokenCollection, { project_id: 1 }, { unique: true, name: 'uniq_project_token' });

  const followCollection = db.collection('follow');
  await safeCreateIndex(followCollection, { uid: 1, projectid: 1 }, { unique: true, name: 'uniq_follow_uid_projectid' });

  const specImportTaskCollection = db.collection('spec_import_task');
  await safeCreateIndex(specImportTaskCollection, { project_id: 1, add_time: -1 }, {
    name: 'idx_spec_import_task_project_add_time'
  });
  await safeCreateIndex(specImportTaskCollection, { status: 1, up_time: -1 }, {
    name: 'idx_spec_import_task_status_up_time'
  });

  await mongoose.disconnect();
  console.log('[index] completed');
}

run().catch(async err => {
  console.error('[index] failed:', err && err.stack ? err.stack : err);
  try {
    await mongoose.disconnect();
  } catch (e) {}
  process.exit(1);
});
