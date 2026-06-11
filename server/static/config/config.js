var Config = Config || {};

Config.version = "pinkacord";
Config.sockjsprefix = '/showdown';

// No explicit port in the page URL means the server is on the protocol's
// default port (443 for https, 80 for http) — e.g. behind Render/Fly/nginx.
// Falling back to 8000 here made the hosted client try host:8000, which
// cloud proxies don't expose → "Couldn't connect to server!".
var defaultPort = location.protocol === 'https:' ? 443 : 80;

Config.server = {
	id: 'showdown',
	host: location.hostname,
	port: location.port ? parseInt(location.port, 10) : defaultPort,
	httpport: location.port ? parseInt(location.port, 10) : defaultPort,
	https: location.protocol === 'https:',
	registered: false,
};

Config.defaultserver = Config.server;

Config.routes = {
	root: 'pokemonshowdown.com',
	client: 'play.pokemonshowdown.com',
};

Config.customcolors = {};
Config.bannedHosts = [];
Config.whitelist = [];
Config.groups = {};
