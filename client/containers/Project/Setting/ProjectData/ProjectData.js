import React, { PureComponent as Component } from 'react';
import {
  Upload,
  Icon,
  message,
  Select,
  Tooltip,
  Button,
  Spin,
  Progress,
  Switch,
  Modal,
  Radio,
  Input,
  Checkbox
} from 'antd';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import './ProjectData.scss';
import axios from 'axios';

import URL from 'url';

const Dragger = Upload.Dragger;
import { saveImportData } from '../../../../reducer/modules/interface';
import { fetchUpdateLogData } from '../../../../reducer/modules/news.js';
import { handleSwaggerUrlData } from '../../../../reducer/modules/project';
const Option = Select.Option;
const confirm = Modal.confirm;
const plugin = require('client/plugin.js');
const RadioGroup = Radio.Group;
const importDataModule = {};
const exportDataModule = {};
const HandleImportData = require('common/HandleImportData');
function handleExportRouteParams(url, status, isWiki) {
  if (!url) {
    return;
  }
  let urlObj = URL.parse(url, true),
    query = {};
  query = Object.assign(query, urlObj.query, { status, isWiki });
  return URL.format({
    pathname: urlObj.pathname,
    query
  });
}

// exportDataModule.pdf = {
//   name: 'Pdf',
//   route: '/api/interface/download_crx',
//   desc: '导出项目接口文档为 pdf 文件'
// }
@connect(
  state => {
    return {
      curCatid: -(-state.inter.curdata.catid),
      basePath: state.project.currProject.basepath,
      updateLogList: state.news.updateLogList,
      swaggerUrlData: state.project.swaggerUrlData
    };
  },
  {
    saveImportData,
    fetchUpdateLogData,
    handleSwaggerUrlData
  }
)
class ProjectData extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectCatid: '',
      menuList: [],
      curImportType: 'swagger',
      curExportType: null,
      showLoading: false,
      dataSync: 'merge',
      exportContent: 'all',
      isSwaggerUrl: false,
      swaggerUrl: '',
      isWiki: false,
      specImportTaskVisible: false,
      specImportTaskId: '',
      specImportTaskStatus: 'idle',
      specImportTaskProgress: 0,
      specImportTaskStage: '',
      specImportTaskMessage: '',
      specImportTaskResult: null
    };
    this.specImportPollTimer = null;
  }
  static propTypes = {
    match: PropTypes.object,
    curCatid: PropTypes.number,
    basePath: PropTypes.string,
    saveImportData: PropTypes.func,
    fetchUpdateLogData: PropTypes.func,
    updateLogList: PropTypes.array,
    handleSwaggerUrlData: PropTypes.func,
    swaggerUrlData: PropTypes.string
  };

  componentWillMount() {
    axios.get(`/api/interface/getCatMenu?project_id=${this.props.match.params.id}`).then(data => {
      if (data.data.errcode === 0) {
        let menuList = data.data.data;
        this.setState({
          menuList: menuList,
          selectCatid: menuList[0]._id
        });
      }
    });
    plugin.emitHook('import_data', importDataModule);
    plugin.emitHook('export_data', exportDataModule, this.props.match.params.id);
  }

  componentWillUnmount() {
    this.clearSpecImportPolling();
  }

  clearSpecImportPolling = () => {
    if (this.specImportPollTimer) {
      clearTimeout(this.specImportPollTimer);
      this.specImportPollTimer = null;
    }
  };

  getSpecImportStatusText = status => {
    const map = {
      idle: '未开始',
      queued: '排队中',
      running: '执行中',
      success: '已完成',
      failed: '失败'
    };
    return map[status] || status;
  };

  startSpecImportPolling = taskId => {
    this.clearSpecImportPolling();
    const poll = async () => {
      try {
        const res = await axios.get('/api/spec/import/task', {
          params: {
            task_id: taskId
          }
        });
        if (!res || !res.data || res.data.errcode !== 0) {
          throw new Error((res && res.data && res.data.errmsg) || '查询导入任务失败');
        }
        const task = res.data.data || {};
        const status = task.status || 'queued';
        const progress = Number(task.progress || 0);
        this.setState({
          specImportTaskStatus: status,
          specImportTaskProgress: progress,
          specImportTaskStage: task.stage || '',
          specImportTaskMessage: task.message || '',
          specImportTaskResult: task.result || null
        });
        if (status === 'success' || status === 'failed') {
          this.clearSpecImportPolling();
          if (status === 'success') {
            message.success(task.message || '导入任务执行成功');
          } else if (task.message) {
            message.error(task.message);
          }
          return;
        }
      } catch (e) {
        this.setState({
          specImportTaskStatus: 'failed',
          specImportTaskMessage: e.message || '查询导入任务失败'
        });
        this.clearSpecImportPolling();
        return;
      }
      this.specImportPollTimer = setTimeout(poll, 1200);
    };
    poll();
  };

  handleCloseSpecImportTask = () => {
    this.setState({
      specImportTaskVisible: false
    });
  };

  downloadSpecImportTaskResult = () => {
    if (!this.state.specImportTaskId) {
      return message.warning('任务 ID 不存在');
    }
    const href = `/api/spec/import/task/download?task_id=${encodeURIComponent(
      this.state.specImportTaskId
    )}`;
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  selectChange(value) {
    this.setState({
      selectCatid: +value
    });
  }

  uploadChange = info => {
    const status = info.file.status;
    if (status !== 'uploading') {
      console.log(info.file, info.fileList);
    }
    if (status === 'done') {
      message.success(`${info.file.name} 文件上传成功`);
    } else if (status === 'error') {
      message.error(`${info.file.name} 文件上传失败`);
    }
  };

  handleAddInterface = async res => {
    return await HandleImportData(
      res,
      this.props.match.params.id,
      this.state.selectCatid,
      this.state.menuList,
      this.props.basePath,
      this.state.dataSync,
      message.error,
      message.success,
      () => this.setState({ showLoading: false })
    );
  };

  getSwaggerImportPayload = options => {
    const projectId = Number(this.props.match.params.id);
    return Object.assign(
      {
        project_id: projectId,
        format: 'auto',
        syncMode: this.state.dataSync
      },
      options
    );
  };

  confirmSwaggerImport = preview => {
    const needConfirm = this.state.dataSync === 'merge' || this.state.dataSync === 'good';
    if (!needConfirm) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const ref = confirm({
        title: '确认执行规范导入',
        okType: 'danger',
        iconType: 'exclamation-circle',
        okText: '确认',
        cancelText: '取消',
        content: (
          <div>
            <p>检测格式：{preview.detectedFormat || 'unknown'}</p>
            <p>分类数量：{preview.categories || 0}</p>
            <p>接口数量：{preview.interfaces || 0}</p>
            <p>BasePath：{preview.basePath || '/'}</p>
            <p>同步模式：{this.state.dataSync}</p>
          </div>
        ),
        onOk() {
          resolve();
        },
        onCancel() {
          const err = new Error('cancel');
          err.__cancel = true;
          reject(err);
          ref.destroy();
        }
      });
    });
  };

  importSwaggerBySpec = async options => {
    this.setState({ showLoading: true });
    try {
      const payload = this.getSwaggerImportPayload(options);
      const dryRunRes = await axios.post('/api/spec/import', Object.assign({}, payload, { dryRun: true }));
      if (!dryRunRes || !dryRunRes.data || dryRunRes.data.errcode !== 0) {
        throw new Error(
          (dryRunRes && dryRunRes.data && dryRunRes.data.errmsg) || '导入预检失败'
        );
      }
      const preview = dryRunRes.data.data || {};
      await this.confirmSwaggerImport(preview);

      const importRes = await axios.post('/api/spec/import', Object.assign({}, payload, { async: true }));
      if (!importRes || !importRes.data || importRes.data.errcode !== 0) {
        throw new Error(
          (importRes && importRes.data && importRes.data.errmsg) || '导入失败'
        );
      }
      const task = importRes.data.data || {};
      if (task.task_id) {
        this.setState({
          specImportTaskVisible: true,
          specImportTaskId: task.task_id,
          specImportTaskStatus: task.status || 'queued',
          specImportTaskProgress: 0,
          specImportTaskStage: '',
          specImportTaskMessage: task.message || '任务已创建',
          specImportTaskResult: null
        });
        message.success(importRes.data.errmsg || '导入任务已提交');
        this.startSpecImportPolling(task.task_id);
      } else {
        message.success(importRes.data.errmsg || '导入成功');
      }
    } catch (e) {
      if (e && e.__cancel) {
        message.info('已取消导入');
      } else {
        message.error(e.message || '导入失败');
      }
    } finally {
      this.setState({ showLoading: false });
    }
  };

  // 本地文件上传
  handleFile = info => {
    if (!this.state.curImportType) {
      return message.error('请选择导入数据的方式');
    }
    if (this.state.selectCatid) {
      this.setState({ showLoading: true });
      let reader = new FileReader();
      reader.readAsText(info.file);
      reader.onload = async res => {
        const content = res.target.result;
        if (this.state.curImportType === 'swagger') {
          await this.importSwaggerBySpec({
            source: 'json',
            json: content
          });
          return;
        }

        let importResult = await importDataModule[this.state.curImportType].run(content);
        if (!importResult || !Array.isArray(importResult.apis)) {
          this.setState({ showLoading: false });
          return message.error('导入解析失败');
        }
        if (this.state.dataSync === 'merge') {
          // 开启同步
          this.showConfirm(importResult);
        } else {
          // 未开启同步
          await this.handleAddInterface(importResult);
        }
      };
    } else {
      message.error('请选择上传的默认分类');
    }
  };

  showConfirm = async res => {
    let that = this;
    let typeid = this.props.match.params.id;
    let apiCollections = res.apis.map(item => {
      return {
        method: item.method,
        path: item.path
      };
    });
    let result = await this.props.fetchUpdateLogData({
      type: 'project',
      typeid,
      apis: apiCollections
    });
    let domainData = result.payload.data.data;
    const ref = confirm({
      title: '您确认要进行数据同步????',
      width: 600,
      okType: 'danger',
      iconType: 'exclamation-circle',
      className: 'dataImport-confirm',
      okText: '确认',
      cancelText: '取消',
      content: (
        <div className="postman-dataImport-modal">
          <div className="postman-dataImport-modal-content">
            {domainData.map((item, index) => {
              return (
                <div key={index} className="postman-dataImport-show-diff">
                  <span className="logcontent" dangerouslySetInnerHTML={{ __html: item.content }} />
                </div>
              );
            })}
          </div>
          <p className="info">温馨提示： 数据同步后，可能会造成原本的修改数据丢失</p>
        </div>
      ),
      async onOk() {
        await that.handleAddInterface(res);
      },
      onCancel() {
        that.setState({ showLoading: false, dataSync: 'normal' });
        ref.destroy();
      }
    });
  };

  handleImportType = val => {
    this.setState({
      curImportType: val,
      isSwaggerUrl: false
    });
  };

  handleExportType = val => {
    this.setState({
      curExportType: val,
      isWiki: false
    });
  };

  // 处理导入信息同步
  onChange = checked => {
    this.setState({
      dataSync: checked
    });
  };

  // 处理swagger URL 导入
  handleUrlChange = checked => {
    this.setState({
      isSwaggerUrl: checked
    });
  };

  // 记录输入的url
  swaggerUrlInput = url => {
    this.setState({
      swaggerUrl: url
    });
  };

  // url导入上传
  onUrlUpload = async () => {
    if (!this.state.curImportType) {
      return message.error('请选择导入数据的方式');
    }

    if (!this.state.swaggerUrl) {
      return message.error('url 不能为空');
    }
    if (this.state.selectCatid) {
      if (this.state.curImportType === 'swagger') {
        await this.importSwaggerBySpec({
          source: 'url',
          url: this.state.swaggerUrl
        });
        return;
      }
      this.setState({ showLoading: true });
      try {
        // 处理swagger url 导入
        await this.props.handleSwaggerUrlData(this.state.swaggerUrl);
        // let result = json5_parse(this.props.swaggerUrlData)
        let res = await importDataModule[this.state.curImportType].run(this.props.swaggerUrlData);
        if (this.state.dataSync === 'merge') {
          // merge
          this.showConfirm(res);
        } else {
          // 未开启同步
          await this.handleAddInterface(res);
        }
      } catch (e) {
        this.setState({ showLoading: false });
        message.error(e.message);
      }
    } else {
      message.error('请选择上传的默认分类');
    }
  };

  // 处理导出接口是全部还是公开
  handleChange = e => {
    this.setState({ exportContent: e.target.value });
  };

  //  处理是否开启wiki导出
  handleWikiChange = e => {
    this.setState({
      isWiki: e.target.checked
    });
  };

  /**
   *
   *
   * @returns
   * @memberof ProjectData
   */
  render() {
    const isTaskFinished =
      this.state.specImportTaskStatus === 'success' || this.state.specImportTaskStatus === 'failed';
    const taskProgressStatus =
      this.state.specImportTaskStatus === 'failed'
        ? 'exception'
        : this.state.specImportTaskStatus === 'success'
        ? 'success'
        : 'active';
    const taskResult = this.state.specImportTaskResult;
    const uploadMess = {
      name: 'interfaceData',
      multiple: true,
      showUploadList: false,
      action: '/api/interface/interUpload',
      customRequest: this.handleFile,
      onChange: this.uploadChange
    };

    let exportUrl =
      this.state.curExportType &&
      exportDataModule[this.state.curExportType] &&
      exportDataModule[this.state.curExportType].route;
    let exportHref = handleExportRouteParams(
      exportUrl,
      this.state.exportContent,
      this.state.isWiki
    );

    // console.log('inter', this.state.exportContent);
    return (
      <div className="g-row">
        <div className="m-panel">
          <div className="postman-dataImport">
            <div className="dataImportCon">
              <div>
                <h3>
                  数据导入&nbsp;
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://hellosean1025.github.io/yapi/documents/data.html"
                  >
                    <Tooltip title="点击查看文档">
                      <Icon type="question-circle-o" />
                    </Tooltip>
                  </a>
                </h3>
              </div>
              <div className="dataImportTile">
                <Select
                  placeholder="请选择导入数据的方式"
                  value={this.state.curImportType}
                  onChange={this.handleImportType}
                >
                  {Object.keys(importDataModule).map(name => {
                    return (
                      <Option key={name} value={name}>
                        {importDataModule[name].name}
                      </Option>
                    );
                  })}
                </Select>
              </div>
              <div className="catidSelect">
                <Select
                  value={this.state.selectCatid + ''}
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="请选择数据导入的默认分类"
                  optionFilterProp="children"
                  onChange={this.selectChange.bind(this)}
                  filterOption={(input, option) =>
                    option.props.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                  }
                >
                  {this.state.menuList.map((item, key) => {
                    return (
                      <Option key={key} value={item._id + ''}>
                        {item.name}
                      </Option>
                    );
                  })}
                </Select>
              </div>
              <div className="dataSync">
                <span className="label">
                  数据同步&nbsp;
                  <Tooltip
                    title={
                      <div>
                        <h3 style={{ color: 'white' }}>普通模式</h3>
                        <p>不导入已存在的接口</p>
                        <br />
                        <h3 style={{ color: 'white' }}>智能合并</h3>
                        <p>
                          已存在的接口，将合并返回数据的 response，适用于导入了 swagger
                          数据，保留对数据结构的改动
                        </p>
                        <br />
                        <h3 style={{ color: 'white' }}>完全覆盖</h3>
                        <p>不保留旧数据，完全使用新数据，适用于接口定义完全交给后端定义</p>
                      </div>
                    }
                  >
                    <Icon type="question-circle-o" />
                  </Tooltip>{' '}
                </span>
                <Select value={this.state.dataSync} onChange={this.onChange}>
                  <Option value="normal">普通模式</Option>
                  <Option value="good">智能合并</Option>
                  <Option value="merge">完全覆盖</Option>
                </Select>

                {/* <Switch checked={this.state.dataSync} onChange={this.onChange} /> */}
              </div>
              {this.state.curImportType === 'swagger' && (
                <div className="dataSync">
                  <span className="label">
                    开启url导入&nbsp;
                    <Tooltip title="swagger url 导入">
                      <Icon type="question-circle-o" />
                    </Tooltip>{' '}
                    &nbsp;&nbsp;
                  </span>

                  <Switch checked={this.state.isSwaggerUrl} onChange={this.handleUrlChange} />
                </div>
              )}
              {this.state.isSwaggerUrl ? (
                <div className="import-content url-import-content">
                  <Input
                    placeholder="http://demo.swagger.io/v2/swagger.json"
                    onChange={e => this.swaggerUrlInput(e.target.value)}
                  />
                  <Button
                    type="primary"
                    className="url-btn"
                    onClick={this.onUrlUpload}
                    loading={this.state.showLoading}
                  >
                    上传
                  </Button>
                </div>
              ) : (
                <div className="import-content">
                  <Spin spinning={this.state.showLoading} tip="上传中...">
                    <Dragger {...uploadMess}>
                      <p className="ant-upload-drag-icon">
                        <Icon type="inbox" />
                      </p>
                      <p className="ant-upload-text">点击或者拖拽文件到上传区域</p>
                      <p
                        className="ant-upload-hint"
                        onClick={e => {
                          e.stopPropagation();
                        }}
                        dangerouslySetInnerHTML={{
                          __html: this.state.curImportType
                            ? importDataModule[this.state.curImportType].desc
                            : null
                        }}
                      />
                    </Dragger>
                  </Spin>
                </div>
              )}
            </div>

            <div
              className="dataImportCon"
              style={{
                marginLeft: '20px',
                display: Object.keys(exportDataModule).length > 0 ? '' : 'none'
              }}
            >
              <div>
                <h3>数据导出</h3>
              </div>
              <div className="dataImportTile">
                <Select placeholder="请选择导出数据的方式" onChange={this.handleExportType}>
                  {Object.keys(exportDataModule).map(name => {
                    return (
                      <Option key={name} value={name}>
                        {exportDataModule[name].name}
                      </Option>
                    );
                  })}
                </Select>
              </div>

              <div className="dataExport">
                <RadioGroup defaultValue="all" onChange={this.handleChange}>
                  <Radio value="all">全部接口</Radio>
                  <Radio value="open">公开接口</Radio>
                </RadioGroup>
              </div>
              <div className="export-content">
                {this.state.curExportType ? (
                  <div>
                    <p className="export-desc">{exportDataModule[this.state.curExportType].desc}</p>
                    <a 
                      target="_blank"
                      rel="noopener noreferrer"
                      href={exportHref}>
                      <Button className="export-button" type="primary" size="large">
                        {' '}
                        导出{' '}
                      </Button>
                    </a>
                    <Checkbox
                      checked={this.state.isWiki}
                      onChange={this.handleWikiChange}
                      className="wiki-btn"
                      disabled={this.state.curExportType === 'json'}
                    >
                      添加wiki&nbsp;
                      <Tooltip title="开启后 html 和 markdown 数据导出会带上wiki数据">
                        <Icon type="question-circle-o" />
                      </Tooltip>{' '}
                    </Checkbox>
                  </div>
                ) : (
                  <Button disabled className="export-button" type="primary" size="large">
                    {' '}
                    导出{' '}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
        <Modal
          title="OpenAPI 导入任务"
          visible={this.state.specImportTaskVisible}
          onCancel={this.handleCloseSpecImportTask}
          footer={[
            <Button
              key="download"
              onClick={this.downloadSpecImportTaskResult}
              disabled={!this.state.specImportTaskId}
            >
              下载结果
            </Button>,
            <Button key="close" type="primary" onClick={this.handleCloseSpecImportTask}>
              {isTaskFinished ? '关闭' : '后台继续'}
            </Button>
          ]}
        >
          <p>任务 ID：{this.state.specImportTaskId || '-'}</p>
          <p>状态：{this.getSpecImportStatusText(this.state.specImportTaskStatus)}</p>
          <Progress
            percent={Math.max(0, Math.min(100, Math.round(this.state.specImportTaskProgress || 0)))}
            status={taskProgressStatus}
          />
          <p>阶段：{this.state.specImportTaskStage || '-'}</p>
          <p>消息：{this.state.specImportTaskMessage || '-'}</p>
          {taskResult && (
            <div style={{ marginTop: 12 }}>
              <p>
                结果：新增 {taskResult.created || 0}，更新 {taskResult.updated || 0}，跳过{' '}
                {taskResult.skipped || 0}，失败 {taskResult.failed || 0}
              </p>
              <pre style={{ maxHeight: 180, overflow: 'auto' }}>
                {JSON.stringify(taskResult, null, 2)}
              </pre>
            </div>
          )}
        </Modal>
      </div>
    );
  }
}

export default ProjectData;
