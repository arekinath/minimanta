var mod_restify = require('restify');
var mod_bunyan = require('bunyan');
var mod_fs = require('fs');
var mod_assert = require('assert-plus');
var mod_rerrors = require('restify-errors');

var lib_handlers = require('./lib/handlers');
var lib_auth = require('./lib/auth');
var lib_utils = require('./lib/utils');

var log = mod_bunyan.createLogger({
	name: 'minimanta',
	level: 'debug',
	serializers: {
		err: mod_bunyan.stdSerializers.err
	}
});

var server = mod_restify.createServer({
	name: 'minimanta',
	version: '1.0.0',
	log: log
});

var config = JSON.parse(mod_fs.readFileSync('config.json', 'utf-8'));
mod_assert.object(config, 'config');
mod_assert.notStrictEqual(config, null);
mod_assert.number(config.port, 'config.port');
mod_assert.string(config.root, 'config.root');

config.log = log;
config.server = server;

var auth = new lib_auth.AuthProvider(config);
var handlers = new lib_handlers.HandlerProvider(config);

server.use(mod_restify.plugins.queryParser());

server.use(function splitPath(req, res, next) {
	req.splitPath = new lib_utils.SplitPath(config, req.path());
	if (!req.splitPath.isValid()) {
		next(new mod_rerrors.BadRequestError('Invalid Manta path'));
		return;
	}
	next();
});

server.use(auth.parseAuthorization.bind(auth));
server.use(auth.parsePresigned.bind(auth));
server.use(auth.authorize.bind(auth));

server.put({
	path: /^/,
	name: 'PutDirectory',
	contentType: 'application/json; type=directory'
}, handlers.putDirectory.bind(handlers));

server.put({
	path: /^/,
	name: 'PutLink',
	contentType: 'application/json; type=link'
}, handlers.putLink.bind(handlers));

server.put({
	path: /^/,
	name: 'PutObject',
	contentType: '*/*'
}, handlers.putObject.bind(handlers));

server.get({
	path: /^/,
	name: 'GetObject'
}, handlers.getObject.bind(handlers));

server.head({
	path: /^/,
	name: 'HeadObject'
}, handlers.headObject.bind(handlers));

server.del({
	path: /^/,
	name: 'DeleteObject'
}, handlers.deleteObject.bind(handlers));

server.opts({
	path: /^/,
	name: 'OptionsObject'
}, handlers.cors.bind(handlers));

server.listen(config.port, function () {
	log.info('listening on port %d', config.port);
});

server.on('after', function (req, res, route, err) {
	var info = {};
	info.req = {
		method: req.method,
		url: req.url,
		headers: req.headers,
		httpVersion: req.httpVersion,
		version: req.version,
		body: req.body
	};
	info.res = {
		statusCode: res.statusCode,
		headers: res._headers,
		body: res._body
	};
	info.err = err;
	log.info(info, 'handled request');
});
