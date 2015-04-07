'use strict';

module.exports = function(kbox) {

  require('./lib/events.js')(kbox);
  require('./lib/install.js')(kbox);
  require('./lib/updates.js')(kbox);

};
