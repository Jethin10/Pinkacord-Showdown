/** @type {import('../play.pokemonshowdown.com/src/client-main').PSConfig} */
var Config = Config || {};

Config.version = "pinkacord";
Config.sockjsprefix = '/showdown';

Config.server = {
	id: 'showdown',
	host: location.hostname,
	port: location.port ? parseInt(location.port, 10) : 8000,
	registered: false,
};

Config.defaultserver = Config.server;

Config.routes = {
	root: 'pokemonshowdown.com',
	client: 'play.pokemonshowdown.com',
};

Config.testclient = true;
