'use strict';

module.exports = function(kbox) {

  var serviceInfo = require('./services.js')(kbox);
  var helpers = kbox.util.helpers;

  // Submitting services for updates
  kbox.update.registerStep(function(step) {
    step.name = 'services-kalabox-image-prepare';
    step.subscribes = ['core-image-prepare'];
    step.deps = ['core-auth'];
    step.description = 'Submitting core service images for updates.';
    step.all = function(state, done) {
      serviceInfo.getStartableServices().forEach(function(service) {
        state.containers.push(service.createOpts.name);
      });
      done();
    };
  });

  kbox.update.registerStep(function(step) {
    step.name = 'services-kalabox-update';
    step.deps = [
      'engine-docker-prepared'
    ];
    step.description = 'Updating your Kalabox services.';
    step.all = function(state, done) {
      kbox.services.install(function(err) {
        if (err) {
          state.status = false;
          done(err);
        } else {
          done();
        }
      });
    };
  });

};
