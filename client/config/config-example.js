/** @type {import('../play.pokemonshowdown.com/src/client-main').PSConfig} */
var Config = Config || {};

Config.version = "pinkacord";
Config.sockjsprefix = '/showdown';

// No explicit port in the page URL means the protocol's default port
// (443 for https, 80 for http), not 8000 — critical behind cloud proxies.
var defaultPort = location.protocol === 'https:' ? 443 : 80;

Config.server = {
	id: 'showdown',
	host: location.hostname,
	port: location.port ? parseInt(location.port, 10) : defaultPort,
	https: location.protocol === 'https:',
	registered: false,
};

Config.defaultserver = Config.server;

Config.routes = {
	root: 'pokemonshowdown.com',
	// Sprites/icons/cries load from `client`. Use OUR host: some ISPs block
	// play.pokemonshowdown.com entirely, and the server proxies any asset we
	// don't ship locally (see proxyAsset in server/sockets.ts).
	client: location.host,
};

Config.testclient = true;
