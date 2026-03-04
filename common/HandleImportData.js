const _ = require('underscore');
const axios = require('axios');


const isNode = typeof global == 'object' && global.global === global;

async function handle(
  res,
  projectId,
  selectCatid,
  menuList,
  basePath,
  dataSync,
  messageError,
  messageSuccess,
  callback,
  token,
  port,
  cookie
) {

  const taskNotice = _.throttle((index, len)=>{
    messageSuccess(`正在导入，已执行任务 ${index+1} 个，共 ${len} 个`)
  }, 3000)

  const nodeRequestConfig = isNode && cookie ? {
    headers: {
      Cookie: cookie
    }
  } : undefined;

  const handleAddCat = async cats => {
    let catsObj = {};
    if (cats && Array.isArray(cats)) {
      for (let i = 0; i < cats.length; i++) {
        let cat = cats[i];
        let findCat = _.find(menuList, menu => menu.name === cat.name);
        catsObj[cat.name] = cat;
        if (findCat) {
          cat.id = findCat._id;
        } else {
          let apipath = '/api/interface/add_cat';
          if (isNode) {
            apipath = 'http://127.0.0.1:' + port + apipath;
          }

          let data = {
            name: cat.name,
            project_id: projectId,
            desc: cat.desc,
            token
          };
          let result = await axios.post(apipath, data, nodeRequestConfig);

          if (result.data.errcode) {
            messageError(result.data.errmsg);
            callback({ showLoading: false });
            return false;
          }
          cat.id = result.data.data._id;
        }
      }
    }
    return catsObj;
  };

  const handleAddInterface = async info => {
    const cats = await handleAddCat(info.cats);
    if (cats === false) {
      return;
    }
    
    const res = info.apis;
    let len = res.length;
    let count = 0;
    let successNum = len;
    let existNum = 0;
    if (len === 0) {
      messageError(`解析数据为空`);
      callback({ showLoading: false });
      return;
    }

    if(info.basePath){
      let projectApiPath = '/api/project/up';
      if (isNode) {
        projectApiPath = 'http://127.0.0.1:' + port + projectApiPath;
      }

      await axios.post(projectApiPath, {
        id: projectId,
        basepath: info.basePath,
        token
      }, nodeRequestConfig)
    }

    const payload = [];
    for (let index = 0; index < res.length; index++) {
      let item = res[index];
      let data = Object.assign({}, item, {
        project_id: projectId,
        catid: selectCatid,
        token
      });
      if (basePath) {
        data.path =
          data.path.indexOf(basePath) === 0 ? data.path.substr(basePath.length) : data.path;
      }
      if (
        data.catname &&
        cats[data.catname] &&
        typeof cats[data.catname] === 'object' &&
        cats[data.catname].id
      ) {
        data.catid = cats[data.catname].id;
      }
      payload.push(data);
    }

    if (isNode) {
      // Node 环境（openapi 导入）使用批量 upsert，避免逐条回环 HTTP
      const chunkSize = 200;
      let bulkPath = `http://127.0.0.1:${port}/api/internal/interface/bulk-upsert`;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      for (let start = 0; start < payload.length; start += chunkSize) {
        const end = Math.min(start + chunkSize, payload.length);
        const chunk = payload.slice(start, end);
        const result = await axios.post(bulkPath, {
          project_id: projectId,
          items: chunk,
          mode: dataSync,
          token
        }, nodeRequestConfig);

        if (!result || !result.data || result.data.errcode !== 0) {
          callback({ showLoading: false });
          messageError((result && result.data && result.data.errmsg) || '批量导入失败');
          return;
        }

        const data = result.data.data || {};
        totalCreated += data.created || 0;
        totalUpdated += data.updated || 0;
        totalSkipped += data.skipped || 0;
        taskNotice(end - 1, payload.length);
      }

      callback({ showLoading: false });
      messageSuccess(
        `成功导入接口 ${totalCreated} 个, 更新接口 ${totalUpdated} 个, 已存在(跳过) ${totalSkipped} 个`
      );
      return;
    }

    for (let index = 0; index < payload.length; index++) {
      let data = payload[index];
      if (dataSync !== 'normal') {
        count++;
        let result = await axios.post('/api/interface/save', Object.assign({}, data, { dataSync }));
        if (result.data.errcode) {
          successNum--;
          callback({ showLoading: false });
          messageError(result.data.errmsg);
        } else {
          existNum = existNum + result.data.data.length;
        }
      } else {
        count++;
        let result = await axios.post('/api/interface/add', data);
        if (result.data.errcode) {
          successNum--;
          if (result.data.errcode == 40022) {
            existNum++;
          }
          if (result.data.errcode == 40033) {
            callback({ showLoading: false });
            messageError('没有权限');
            break;
          }
        }
      }

      if (count === len) {
        callback({ showLoading: false });
        messageSuccess(`成功导入接口 ${successNum} 个, 已存在的接口 ${existNum} 个`);
        return;
      }
      taskNotice(index, payload.length);
    }
  };

  return await handleAddInterface(res);
}

module.exports = handle;
