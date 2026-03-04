// Module Scope
var mongoose = require('mongoose'),
    yapi = require('../yapi.js'),
    extend = require('extend'),
    counterSchema,
    IdentityCounter;

const MAX_COUNTER_ATTEMPTS = 100;

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
// Initialize plugin by creating counter collection in database.
exports.initialize = function (connection) {
  try {
    IdentityCounter = mongoose.model('IdentityCounter');
  } catch (ex) {
    if (ex.name === 'MissingSchemaError') {
      // Create new counter schema.
      counterSchema = new mongoose.Schema({
        model: { type: String, require: true },
        field: { type: String, require: true },
        count: { type: Number, default: 0 }
      });

      // Create a unique index using the "field" and "model" fields.
      counterSchema.index({ field: 1, model: 1 }, { unique: true, required: true, index: -1 });

      // Create model using new schema.
      IdentityCounter = mongoose.model('IdentityCounter', counterSchema);
    }
    else
      throw ex;
  }
};

// The function to use when invoking the plugin on a custom schema.
exports.plugin = function (schema, options) {

  // If we don't have reference to the counterSchema or the IdentityCounter model then the plugin was most likely not
  // initialized properly so throw an error.
  if (!counterSchema || !IdentityCounter) throw new Error("mongoose-auto-increment has not been initialized");

  // Default settings and plugin scope variables.
  var settings = {
    model: null, // The model to configure the plugin for.
    field: '_id', // The field the plugin should track.
    startAt: 0, // The number the count should start at.
    incrementBy: 1, // The number by which to increment the count each time.
    unique: true // Should we create a unique index for the field
  },
  fields = {}, // A hash of fields to add properties to in Mongoose.
  ready = false; // True if the counter collection has been updated and the document is ready to be saved.

  switch (typeof(options)) {
    // If string, the user chose to pass in just the model name.
    case 'string':
      settings.model = options;
    break;
    // If object, the user passed in a hash of options.
    case 'object':
      extend(settings, options);
    break;
  }

  if (settings.model == null)
    throw new Error("model must be set");

  const counterQuery = { model: settings.model, field: settings.field };

  // Add properties for field in schema.
  fields[settings.field] = {
    type: Number,
    require: true
  };
  if (settings.field !== '_id')
    fields[settings.field].unique = settings.unique
  schema.add(fields);

  // Find the counter for this model and the relevant field.
  IdentityCounter.findOne(
    counterQuery,
    function (err, counter) {
      if (err) {
        try { yapi.commons.log(`[AutoInc] findOne counter error for ${settings.model}.${settings.field}: ${err && (err.stack || err)}`, 'error'); } catch(e){}
      }
      if (!counter) {
        // If no counter exists then create one and save it.
        counter = new IdentityCounter(extend({}, counterQuery, { count: settings.startAt - settings.incrementBy }));
        counter.save(function (saveErr) {
          if (saveErr) {
            try { yapi.commons.log(`[AutoInc] init counter save error for ${settings.model}.${settings.field}: ${saveErr && (saveErr.stack || saveErr)}`, 'error'); } catch(e){}
          }
          ready = true;
        });
      }
      else {
        ready = true;
      }
    }
  );

  // Declare a function to get the next counter for the model/schema.
  var nextCount = function (callback) {
    IdentityCounter.findOne(
      counterQuery,
      function (err, counter) {
        if (err) {
          try { yapi.commons.log(`[AutoInc] nextCount error for ${settings.model}.${settings.field}: ${err && (err.stack || err)}`, 'error'); } catch(e){}
          return callback(err);
        }
        callback(null, counter === null ? settings.startAt : counter.count + settings.incrementBy);
      }
    );
  };
  // Add nextCount as both a method on documents and a static on the schema for convenience.
  schema.method('nextCount', nextCount);
  schema.static('nextCount', nextCount);

  // Declare a function to reset counter at the start value - increment value.
  var resetCount = function (callback) {
    seedCounterIfMissing()
      .then(function () {
        return IdentityCounter.updateOne(
          counterQuery,
          { $set: { count: settings.startAt - settings.incrementBy } }
        ).exec();
      })
      .then(function () {
        callback(null, settings.startAt);
      })
      .catch(function (err) {
        try { yapi.commons.log(`[AutoInc] resetCount error for ${settings.model}.${settings.field}: ${err && (err.stack || err)}`, 'error'); } catch(e){}
        callback(err);
      });
  };
  // Add resetCount as both a method on documents and a static on the schema for convenience.
  schema.method('resetCount', resetCount);
  schema.static('resetCount', resetCount);

  function getModifiedCount(result) {
    if (!result) return 0;
    if (typeof result.modifiedCount === 'number') return result.modifiedCount;
    if (typeof result.nModified === 'number') return result.nModified;
    return 0;
  }

  function normalizeCountValue(value) {
    if (typeof value === 'number') {
      return value;
    }
    var numericValue = Number(value);
    if (!isNaN(numericValue) && isFinite(numericValue)) {
      return numericValue;
    }
    return settings.startAt - settings.incrementBy;
  }

  async function seedCounterIfMissing() {
    var counter = await IdentityCounter.findOne(counterQuery).lean().exec();
    if (counter) {
      return counter;
    }
    var seedDoc = new IdentityCounter(extend({}, counterQuery, { count: settings.startAt - settings.incrementBy }));
    try {
      await seedDoc.save();
      return { count: settings.startAt - settings.incrementBy };
    } catch (err) {
      if (err && err.code === 11000) {
        return IdentityCounter.findOne(counterQuery).lean().exec();
      }
      throw err;
    }
  }

  async function ensureCounterAtLeastValue(targetValue) {
    var numericTarget = normalizeCountValue(targetValue);
    await seedCounterIfMissing();
    return IdentityCounter.updateOne(
      extend({}, counterQuery, { count: { $lt: numericTarget } }),
      { $set: { count: numericTarget } }
    ).exec();
  }

  async function incrementCounterValue() {
    for (var attempt = 0; attempt < MAX_COUNTER_ATTEMPTS; attempt += 1) {
      var counter = await seedCounterIfMissing();
      if (!counter) {
        await delay(5);
        continue;
      }
      var currentCount = normalizeCountValue(counter.count);
      var nextValue = currentCount + settings.incrementBy;
      var updateResult = await IdentityCounter.updateOne(
        extend({}, counterQuery, { count: currentCount }),
        { $set: { count: nextValue } }
      ).exec();
      if (getModifiedCount(updateResult) === 1) {
        return nextValue;
      }
      await delay(5);
    }
    throw new Error(`Unable to increment counter for ${settings.model}.${settings.field} after ${MAX_COUNTER_ATTEMPTS} attempts`);
  }

  // Every time documents in this schema are saved, run this logic.
  schema.pre('save', function (next) {
    // Get reference to the document being saved.
    var doc = this;

    // Only do this if it is a new document (see http://mongoosejs.com/docs/api.html#document_Document-isNew)
    if (!doc.isNew) {
      return next();
    }

    var attemptSave = function () {
      if (!ready) {
        setTimeout(attemptSave, 5);
        return;
      }
      processDoc();
    };

    var processDoc = function () {
      (async function () {
        try {
          if (Object.prototype.hasOwnProperty.call(doc, settings.field) && doc[settings.field] === null) {
            yapi.commons.log(`[AutoInc] WARN ${settings.model} ${settings.field} is null before save`, 'error');
          }
        } catch (e) {}

        try {
          if (typeof doc[settings.field] === 'number') {
            await ensureCounterAtLeastValue(doc[settings.field]);
            return next();
          }
          var updatedCounterValue = await incrementCounterValue();
          doc[settings.field] = updatedCounterValue;
          return next();
        } catch (err) {
          try { yapi.commons.log(`[AutoInc] counter update error for ${settings.model}.${settings.field}: ${err && (err.stack || err)}`, 'error'); } catch(e){}
          return next(err);
        }
      })();
    };

    attemptSave();
  });
};
