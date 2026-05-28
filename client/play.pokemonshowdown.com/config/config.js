/** @type {import('../src/client-main').PSConfig} */
var Config = Config || {};

Config.version = "pinkacord";

// Connect to whatever server is hosting this page
Config.defaultserver = {
	id: 'showdown',
	host: location.hostname,
	port: location.port ? parseInt(location.port, 10) : 8000,
	httpport: location.port ? parseInt(location.port, 10) : 8000,
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
