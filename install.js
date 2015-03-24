'use strict';

module.exports = function(kbox) {

  kbox.install.registerStep(function(step) {
    step.name = 'kalabox-services';
    step.description = step.name;
    step.deps = [];
    step.all = function(state, done) {
      console.log(step.name);
      done();
    };
  });

};
