const mongoose = require('mongoose');
const yapi = require('../yapi.js');
const autoIncrement = require('./mongoose-auto-increment');
const initMongoDebug = require('./debug-mongo');

function model(model, schema) {
  if (schema instanceof mongoose.Schema === false) {
    schema = new mongoose.Schema(schema);
  }
  schema.set('autoIndex', false);
  return mongoose.model(model, schema, model);
}

function connect(callback) {
  mongoose.Promise = global.Promise;

  const config = yapi.WEBCONFIG;

  // 清理旧键；poolSize -> maxPoolSize；loadBalanced 只能在 URI
  const sanitize = (opts = {}) => {
    const o = { ...opts };
    [
      'useNewUrlParser',
      'useUnifiedTopology',
      'useCreateIndex',
      'useFindAndModify',
      'reconnectTries',
      'reconnectInterval',
    ].forEach(k => delete o[k]);
    if (o.poolSize != null) { o.maxPoolSize = o.poolSize; delete o.poolSize; }
    delete o.loadBalanced; // 必须放到 URI
    return o;
  };

  // 组装 options（最小化）
  let options = {};
  if (config.db.user) {
    options.user = config.db.user;
    options.pass = config.db.pass;
  }
  options = sanitize(Object.assign({}, options, config.db.options));

  // 组装连接串
  let connectString = '';
  if (config.db.connectString) {
    connectString = config.db.connectString;
  } else {
    connectString = `mongodb://${config.db.servername}:${config.db.port}/${config.db.DATABASE}`;
    if (config.db.authSource) {
      connectString += `?authSource=${encodeURIComponent(config.db.authSource)}`;
    }
  }
  // 若配置里写了 loadBalanced，则补到 URI（Driver 4 的硬规则）
  if (config.db.options && typeof config.db.options.loadBalanced !== 'undefined') {
    const lb = config.db.options.loadBalanced ? 'true' : 'false';
    connectString += (connectString.includes('?') ? '&' : '?') + `loadBalanced=${lb}`;
  }

  // 关键：不要给 mongoose.connect 传第 3 个回调参数！确保返回 Promise
  const dbPromise = mongoose.connect(connectString, options);

  dbPromise.then(() => {
    yapi.commons.log('mongodb load success...');

    // 连接成功后再初始化自增
    try {
      autoIncrement.initialize(mongoose.connection);
    } catch (e) {
      yapi.commons.log('autoIncrement initialize failed: ' + e, 'error');
    }

    // 附加调试与命令事件监听，定位 collection/操作/负载
    try {
      initMongoDebug(mongoose.connection);
    } catch (e) {
      yapi.commons.log('initMongoDebug failed: ' + (e && e.stack || e), 'error');
    }

    if (typeof callback === 'function') {
      // 兼容老代码写法
      callback.call(mongoose.connection);
    }
  }).catch(err => {
    yapi.commons.log(err + 'mongodb connect error', 'error');
  });

  return dbPromise; // 让 app.js 里的 yapi.connect = dbModule.connect() 是个 thenable
}

yapi.db = model;

module.exports = {
  model,
  connect
};
