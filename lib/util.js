'use strict';

/**
 * This contains all helper methods for the services install
 */

module.exports = function(kbox) {

  // Native modules
  var fs = require('fs');
  var path = require('path');

  // Npm modules
  var _ = require('lodash');

  // Kalabox modules
  var meta = require('./meta.js')(kbox);
  var provider = kbox.engine.provider;
  var Promise = kbox.Promise;
  var config = kbox.core.deps.get('globalConfig');

  // Set Kalabox DNS constantsz
  // @todo: stronger test
  var KALABOX_WIN32_DNS = '10.13.37.42';

  /*
   * Return some info about the current state of the kalabox installation
   */
  var getCurrentInstall = function(installDetails) {

    // This is where our current install file should live
    var cIF = path.join(config.sysConfRoot, 'installed.json');

    // If the file exists use that if not empty object
    var currentInstall = (fs.existsSync(cIF)) ? require(cIF) : {};

    return currentInstall;

  };

  /*
   * Helper function to grab and compare a meta prop
   */
  var getProUp = function(prop) {

    // Get details about the state of the current installation
    var currentInstall = getCurrentInstall();

    // This is the first time we've installed so we def need
    if (_.isEmpty(currentInstall) || !currentInstall[prop]) {
      return true;
    }

    // We have a syncversion to compare
    // @todo: is diffence a strong enough check?
    var nV = meta[prop];
    if (currentInstall[prop] && (currentInstall[prop] !== nV)) {
      return true;
    }

    // Hohum i guess we're ok
    return false;

  };

  /*
   * Helper function to assess whether we need new service images
   */
  var needsImages = function() {
    return getProUp('SERVICE_IMAGES_VERSION');
  };

  /*
   * Helper function to determine whether we need to run darwin DNS commands
   */
  var needsDarwinDNS = function() {
    var dnsPath = path.join(meta.dns.darwin.path, meta.dns.darwin.file);
    return !fs.existsSync(dnsPath);
  };

  /*
   * Return linux dns information.
   * @todo: clean this up
   */
  var getLinuxDnsServers = _.once(function() {

    // Get linux flavor.
    var flavor = kbox.install.linuxOsInfo.getFlavor();

    // Get linux flavor distribution.
    var distro = (flavor === 'debian') ? flavor : 'linux';

    // Build path to dns file.
    var dnsFilepath = path.join(
      meta.dns.linux[distro].path,
      meta.dns.linux[distro].file
    );

    // Read dns file.
    return Promise.fromNode(function(cb) {
      fs.readFile(dnsFilepath, {encoding: 'utf8'}, cb);
    })
    // If file does not exist return false otherwise throw error.
    .catch(function(err) {
      if (err.code === 'ENOENT') {
        return '';
      } else {
        throw err;
      }
    })
    // Split data read from file into lines.
    .then(function(data) {
      return data.split('\n');
    })
    // Filter out uninteresting lines.
    .filter(function(line) {
      var isComment = _.startsWith(line, '#');
      var hasSpaces = _.contains(line, ' ');
      // Filter out comments, and only include lines which contain spaces.
      return !isComment && hasSpaces;
    })
    // Reduce remaining lines into an array of name servers.
    .reduce(function(dnsServers, line) {
      // Split each line, trim the parts, and remove double quotes.
      var parts = _.chain(line.split(' '))
        .map(_.trim)
        .map(function(part) {
          return part.replace(/"/g, '');
        })
        .value();
      // If parts array starts with nameserver, the second element is a
      // dns nameserver, so add it to the list of dns servers.
      if (parts[0] === 'nameserver') {
        dnsServers.push(parts[1]);
      }
      return dnsServers;
    }, []);
  });

  /*
   * Helper function to determine whether we need to run linux DNS commands
   */
  var needsLinuxDNS = function() {

    // Use for later
    var ips = [];

    // Grab list of server IPs
    return provider().call('getServerIps')

    // Add dns servers to list of dns options.
    // Get list of dns server configured on this linux host.
    .then(function(result) {
      ips = result;
      return getLinuxDnsServers();
    })

    // If we are missing DNS servers add them
    .then(function(dnsServers) {

      // Get what DNS servers we should consider adding
      var diff = _.difference(ips, dnsServers);
      return !_.isEmpty(diff);
    });

  };

  /*
   * Returns what we need to add for DNS to linux
   */
  var getLinuxDNStoAdd = function() {

    // Use this later
    var serverIps = [];

    // Grab list of server IPs
    return provider().call('getServerIps')

    // Add dns servers to list of dns options.
    // Get list of dns server configured on this linux host.
    .then(function(result) {
      serverIps = result;
      return getLinuxDnsServers();
    })

    // If we are missing DNS servers add them
    .then(function(dnsServers) {

      // If list of configured dns servers doesn't include this
      // IP then we need to run things
      var ipsToAdd = [];
      _.each(serverIps, function(ip) {
        if (!_.contains(dnsServers, ip)) {
          ipsToAdd.push(['nameserver', ip].join(' '));
        }
      });

      // Debug
      kbox.core.log.debug('DNS2ADD4U => ' + JSON.stringify(ipsToAdd));

      // Return what we need to add
      return ipsToAdd;

    });

  };

  /*
   * Get the correct windows network adapter
   */
  var getWindowsAdapter = function() {

    // Get shell library.
    var shell = kbox.core.deps.get('shell');

    // Command to run
    var cmd = [
      '"C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe"',
      'showvminfo "Kalabox2" | findstr "Host-only"'
    ];

    // Get network information from virtual box.
    return Promise.fromNode(function(cb) {
      shell.exec(cmd.join(' '), cb);
    })

    // Parse the output
    .then(function(output) {

      // Debug log output
      kbox.core.log.debug('ADAPTER INFO => ' + JSON.stringify(output));

      // Parse output to get network adapter information.
      var start = output.indexOf('\'');
      var last = output.lastIndexOf('\'');

      // Get the adapter
      var adapter = [
        output.slice(start + 1, last).replace('Ethernet Adapter', 'Network')
      ];

      // debug
      kbox.core.log.debug('WINDOWS ADAPTER => ' + JSON.stringify(adapter));

      // Return
      return adapter;
    });

  };

  /*
   * Helper function to determine whether we need to run win32 DNS commands
   * @todo: Need to expand this to handle both nameservers
   */
  var needsWin32DNS = function() {

    // Get shell library.
    var shell = kbox.core.deps.get('shell');

    // @todo: Need a stronger check than this eventually
    var ip = KALABOX_WIN32_DNS;

    // Grab the host only adapter so we can be SUPER PRECISE!
    return getWindowsAdapter()

    // Get network information from virtual box.
    .then(function(adapter) {

      var adp = adapter;

      // Command to run
      var cmd = 'netsh interface ipv4 show dnsservers';

      // Execute promisified shell
      return Promise.fromNode(function(cb) {
        shell.exec(cmd, cb);
      })

      // Need to catch findstr null reporting as error
      .catch(function(err) {
        // @todo: something more precise here
      })

      .then(function(output) {

        // Truncate the string for just data on what we need
        // This elminates the possibility that another adapter has our
        // setup. Although, to be fair, if another adapter does then
        // we are probably SOL anyway.

        // Trim the left
        var leftTrim = 'Configuration for interface "' + adp + '"';
        var truncLeft = output.indexOf(leftTrim);
        var left = output.slice(truncLeft);

        // Trim the right
        var rightTrim = 'Register with which suffix:';
        var truncRight = left.indexOf(rightTrim);
        var adapterConfig = left.slice(0, truncRight);

        // Get the raw DNS IPs
        var aSplit = adapterConfig.split(':');
        var rawAdapters = _.trim(aSplit[1]);

        // Map to array of IPs
        var adapters = _.map(rawAdapters.split('\r\n'), function(rawAdapter) {
          return _.trim(rawAdapter);
        });

        // Return precise
        var needDns = adapters[0] !== KALABOX_WIN32_DNS;
        kbox.core.log.debug('DNS SET CORRECTLY => ' + JSON.stringify(needDns));
        return needDns;
      });
    });

  };

  /*
   * Validate admin commands
   */
  var validateCmds = function(cmds) {

    // Check if this is an array
    if (!Array.isArray(cmds)) {
      return 'Invalid adminCommands: ' + cmds;
    }

    // Check if each cmd is a string
    cmds.forEach(function(cmd, index) {
      if (typeof cmd !== 'string' || cmd.length < 1) {
        return 'Invalid cmd index: ' + index + ' cmd: ' + cmd;
      }
    });

    // Looks like we good!
    return true;

  };

  /*
   * Run the admin commands
   */
  var runCmds = function(adminCommands, state, callback) {

    // Validate the admin commands
    if (validateCmds(adminCommands) !== true) {
      callback(new Error(validateCmds(adminCommands)));
    }

    // Process admin commands.
    var child = kbox.install.cmd.runCmdsAsync(adminCommands, state);

    // Events
    // Output data
    child.stdout.on('data', function(data) {
      state.log.info(data);
    });
    // Callback when done
    child.stdout.on('end', function() {
      callback();
    });
    // Output stderr data.
    child.stderr.on('data', function(data) {
      state.log.info(data);
    });
    // Fail the installer if we get an error
    child.stderr.on('error', function(err) {
      state.fail(state, err);
    });

  };

  /*
   * Helper to set up darwin DNS
   */
  var setupDarwinDNS = function(state) {

    // Start up a collector
    var dnsCmds = [];

    // Get list of server ips.
    return provider().call('getServerIps')

    // Add dns setup command.
    .then(function(ips) {

      // Build DNS command
      if (needsDarwinDNS()) {
        var dnsFile = [meta.dns.darwin.path, meta.dns.darwin.file];
        var ipCmds = kbox.install.cmd.buildDnsCmd(ips, dnsFile);
        var cmd = ipCmds.join(' && ');
        dnsCmds.push(cmd);
      }

      // Debug
      kbox.core.log.debug('DNS CMDS => ' + JSON.stringify(dnsCmds));

      // Try to install DNS if we have commands to run
      return Promise.fromNode(function(cb) {
        if (!_.isEmpty(dnsCmds)) {
          runCmds(dnsCmds, state, cb);
        }
        else {
          cb();
        }
      });

    });

  };

  /*
   * Helper to set up windows DNS
   */
  var setupWindowsDNS = function(state) {

    // Start up a collector
    var dnsCmds = [];

    return needsWin32DNS()

    .then(function(needsDns) {
      if (needsDns) {
        // Grab the appropriate windows network adapter
        return getWindowsAdapter()
        // Generate teh DNS commands and run it
        .then(function(adapter) {

          // Get list of server IPs.
          return provider().call('getServerIps')

          .then(function(ips) {

            // Build DNS commands
            dnsCmds = (kbox.install.cmd.buildDnsCmd(ips, adapter));

            // Debug
            state.log.debug('DNS CMDS => ' + JSON.stringify(dnsCmds));

            // Run each command through elevation
            // @todo: doesn't seem like node-windows can
            // handle combining via & or && so do this for now
            return Promise.each(dnsCmds, function(cmd) {
              return kbox.util.shell.execElevated(cmd);
            });
          });

        });
      }
    });

  };

  /*
   * Helper to set up linux DNS
   */
  var setupLinuxDNS = function(state) {

    // Start a collection
    var dnsCmds = [];
    // Grab linux flavor
    var flavor = kbox.install.linuxOsInfo.getFlavor();
    // Grab a generic dis
    var dis = (flavor === 'debian') ? flavor : 'linux';

    // Check out what we need to add
    return getLinuxDNStoAdd()

    // Put together some commands if we need to
    .then(function(ips) {

      // Check if we need linux DNS
      return needsLinuxDNS()

      // Create DNS command
      .then(function(needIt) {
        if (needIt) {
          var dnsFile = [meta.dns.linux[dis].path, meta.dns.linux[dis].file];
          dnsCmds = kbox.install.cmd.buildDnsCmd(ips, dnsFile);
          dnsCmds.push('resolvconf -u');
        }
      })

      // Run commands if needed
      .then(function() {
        // Debug
        state.log.debug('DNS CMDS => ' + JSON.stringify(dnsCmds));

        // Try to install DNS if we have commands to run
        return Promise.fromNode(function(cb) {
          if (!_.isEmpty(dnsCmds)) {
            runCmds(dnsCmds, state, cb);
          }
          else {
            cb();
          }
        });
      });

    });

  };

  return {
    needsImages: needsImages,
    setupDarwinDNS: setupDarwinDNS,
    setupWindowsDNS: setupWindowsDNS,
    setupLinuxDNS: setupLinuxDNS
  };

};
