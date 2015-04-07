'use strict';

module.exports = function(kbox) {

  var serviceInfo = require('./services.js')(kbox);
  var helpers = kbox.util.helpers;

  // Submitting services for updates
  kbox.update.registerStep(function(step) {
    step.name = 'services-image-prepare';
    step.subscribes = ['kbox-image-prepare'];
    step.deps = ['kbox-auth'];
    step.description = 'Submitting core service images for updates.';
    step.all = function(state, done) {
      serviceInfo.getStartableServices().forEach(function(service) {
        state.containers.push(service.createOpts.name);
      });
      done();
    };
  });

  kbox.update.registerStep(function(step) {
    step.name = 'services-update';
    step.deps = ['engine-prepared'];
    step.description = 'Updating your Kalabox services.';
    step.all = function(state, done) {
      kbox.services.install(function(err) {
        if (err) {
          state.log(state.status.notOk);
          done(err);
        } else {
          state.log(state.status.ok);
          done();
        }
      });
    };
  });

};
