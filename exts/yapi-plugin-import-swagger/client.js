import { message } from 'antd';

module.exports = function() {
  this.bindHook('import_data', function(importDataModule) {
    if (!importDataModule || typeof importDataModule !== 'object') {
      console.error('importDataModule 参数Must be Object Type');
      return null;
    }
    importDataModule.swagger = {
      name: 'Swagger',
      run: async function() {
        message.error('Swagger 导入已切换到服务端解析，请使用“数据导入”页面执行导入');
        throw new Error('Swagger import now uses /api/spec/import');
      },
      desc: `<p>Swagger数据导入（ 支持 v2.0+ ）</p>
      <p>
        <a target="_blank" href="https://hellosean1025.github.io/yapi/documents/data.html#通过命令行导入接口数据">通过命令行导入接口数据</a>
      </p>
      `
    };
  });
};
