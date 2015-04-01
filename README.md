# Kalabox Services Kalabox

This is the core set of services needed to support Kalabox apps using the Docker engine.

Services are any additional containers that are needed to support apps. This could be something like an nginx reverse proxy or dnsmasq or both. Different services backends can be swapped out in the global config using the services key.

Currently Kalabox implements a set of services called "Kalabox" that are used to support our docker based apps. Specifically we are using hipache as a reverse proxy, dnsmasq to handle requests to .kbox domains, skydock to troll the docker events stream for starts and stops and skydns to handle intra-docker dns resolution.

## Other Resourcesz

* [API docs](http://api.kalabox.me/)
* [Test coverage reports](http://coverage.kalabox.me/)
* [Kalabox CI dash](http://ci.kalabox.me/)
* [Mountain climbing advice](https://www.youtube.com/watch?v=tkBVDh7my9Q)
* [Boot2Docker](https://github.com/boot2docker/boot2docker)
* [Syncthing](https://github.com/syncthing/syncthing)
* [Docker](https://github.com/docker/docker)

-------------------------------------------------------------------------------------
(C) 2015 Kalamuna and friends


