'use strict';

module.exports = function(kbox) {

  // Install services.
  kbox.install.registerStep(function(step) {
    step.name = 'kalabox-services-kalabox';
    step.description = 'Install kalabox-services-kalabox plugin services.';
    step.deps = ['init-engine'];
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
