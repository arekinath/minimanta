var mod_restify = require('restify');
var mod_bunyan = require('bunyan');

var lib_handlers = require('./lib/handlers');
var lib_auth = require('./lib/auth');

var log = mod_bunyan.createLogger({
	name: 'minimanta'
});

var server = mod_restify.createServer({
	name: 'minimanta',
	version: '1.0.0',
	log: log
});

server.use(mod_restify.queryParser());
server.use(lib_auth.authorizationParser);
server.use(lib_auth.presignParser);

server.put({
	path: /^[/][^/]+[/][^/]+[/]/,
	name: 'PutDirectory',
	contentType: 'application/json; type=directory'
}, lib_handlers.putDirectory);

server.put({
	path: /^[/][^/]+[/][^/]+[/]/,
	name: 'PutLink',
	contentType: 'application/json; type=link'
}, lib_handlers.putLink);

server.put({
	path: /^[/][^/]+[/][^/]+[/]/,
	name: 'PutObject',
	contentType: '*/*'
}, lib_handlers.putObject);

server.get({
	path: /^[/][^/]+[/][^/]+[/]/,
	name: 'GetObject'
}, lib_handlers.getObject);

server.head({
	path: /^[/][^/]+[/][^/]+[/]/,
	name: 'HeadObject'
}, lib_handlers.headObject);

server.del({
	path: /^[/][^/]+[/][^/]+[/]/,
	name: 'DeleteObject'
}, lib_handlers.deleteObject);

server.opts({
	path: /^[/][^/]+[/][^/]+[/]/,
	name: 'OptionsObject'
}, lib_handlers.cors);

var port = 8080;
server.listen(port, function () {
	log.info('listening on port %d', port);
});
