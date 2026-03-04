const baseModel = require('./base.js');

class specImportTaskModel extends baseModel {
  getName() {
    return 'spec_import_task';
  }

  getSchema() {
    return {
      project_id: { type: Number, required: true },
      uid: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ['queued', 'running', 'success', 'failed'],
        default: 'queued'
      },
      progress: { type: Number, default: 0 },
      stage: { type: String, default: '' },
      message: { type: String, default: '' },
      request_payload: { type: String, default: '' },
      result: { type: String, default: '' },
      error: { type: String, default: '' },
      add_time: Number,
      up_time: Number
    };
  }

  save(data) {
    const m = new this.model(data);
    return m.save();
  }

  get(id) {
    return this.model
      .findOne({
        _id: id
      })
      .exec();
  }

  listByProject(project_id, page, limit) {
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    return this.model
      .find({
        project_id
      })
      .sort({ add_time: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }

  countByProject(project_id) {
    return this.model.countDocuments({
      project_id
    });
  }

  up(id, data) {
    return this.model.updateOne(
      {
        _id: id
      },
      {
        $set: data
      }
    );
  }
}

module.exports = specImportTaskModel;
