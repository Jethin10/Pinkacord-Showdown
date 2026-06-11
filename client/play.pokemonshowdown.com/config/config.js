/** @type {import('../src/client-main').PSConfig} */
var Config = Config || {};

Config.version = "pinkacord";

// Connect to whatever server is hosting this page.
// No explicit port in the page URL means the protocol's default port
// (443 for https, 80 for http), not 8000 — critical behind cloud proxies.
var defaultPort = location.protocol === 'https:' ? 443 : 80;
Config.defaultserver = {
	id: 'showdown',
	host: location.hostname,
	port: location.port ? parseInt(location.port, 10) : defaultPort,
	httpport: location.port ? parseInt(location.port, 10) : defaultPort,
	https: location.protocol === 'https:',
};

Config.routes = {
	root: location.host,
	client: location.host,
	dex: location.host,
	replays: location.host,
};

Config.customcolors = {};
Config.bannedHosts = [];
Config.whitelist = [];
Config.groups = {};
