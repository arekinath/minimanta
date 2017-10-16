module.exports = {
	HandlerProvider: HandlerProvider
};

var mod_assert = require('assert-plus');
var mod_vasync = require('vasync');
var mod_rerrors  = require('restify-errors');

function HandlerProvider(config) {
	this.hp_config = config;
}

HandlerProvider.prototype.headObject = function headObject(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	var fo = req.splitPath.getFstorObject();
	fo.open('r', function (err) {
		if (err) {
			next(new mod_rerrors.InternalServerError());
			return;
		}

		if (!fo.exists()) {
			fo.closeAll();
			next(new mod_rerrors.NotFoundError());

		} else if (fo.isDirectory()) {
			fo.getChildren(function (err, kids) {
				if (err) {
					fo.closeAll();
					next(new mod_rerrors.
					    InternalServerError());
					return;
				}
				res.header('content-type',
				    'application/x-json-stream; type=directory');
				res.header('result-set-size',
				    Object.keys(kids).length);
				res.header('etag', fo.getMetadata('etag'));
				res.status(200);
				res.end();
				fo.closeAll();
				next();
			});

		} else if (fo.isObject()) {
			res.header('content-type',
			    fo.getMetadata('content-type'));
			res.header('etag', fo.getMetadata('etag'));
			res.header('content-length', fo.getSize());
			res.header('last-modified',
			    fo.getmtime().toUTCString());
			res.status(200);
			res.end();
			fo.closeAll();
			next();
		}
	});
};

HandlerProvider.prototype.getObject = function getObject(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	var fo = req.splitPath.getFstorObject();
	fo.open('r', function (err) {
		if (err) {
			log.error(err, 'failed to open object/dir');
			next(new mod_rerrors.InternalServerError());
			return;
		}

		if (!fo.exists()) {
			fo.closeAll();
			next(new mod_rerrors.NotFoundError());

		} else if (fo.isDirectory()) {
			res.header('content-type',
			    'application/x-json-stream; type=directory');
			res.header('etag', fo.getMetadata('etag'));
			res.status(200);
			fo.writeDirToStream(res, function (err) {
				fo.closeAll();
				next(err);
			});

		} else if (fo.isObject()) {
			res.header('content-type',
			    fo.getMetadata('content-type'));
			res.header('etag', fo.getMetadata('etag'));
			res.header('content-length', fo.getSize());
			res.header('last-modified',
			    fo.getmtime().toUTCString());
			res.status(200);
			var rs = fo.getReadStream();
			rs.pipe(res);
			rs.on('error', function (err) {
				fo.closeAll();
				next(err);
			});
			rs.on('end', function () {
				fo.closeAll();
				next();
			});
		}
	});
};

HandlerProvider.prototype.cors = function cors(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	res.send(200);
	next();
};

HandlerProvider.prototype.putDirectory = function putDirectory(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	req.resume();
	var fo = req.splitPath.getFstorObject();
	var pfo = fo.getParent();
	pfo.open('r', function (err) {
		if (err) {
			log.error(err, 'failed to open parent dir');
			fo.closeAll();
			next(new mod_rerrors.InternalServerError());
			return;
		}

		if (!pfo.exists() || !pfo.isDirectory()) {
			next(new mod_rerrors.BadRequestError());
			fo.closeAll();
			return;
		}

		fo.mkdir(function (err2) {
			if (err2 && err2.code === 'EEXIST') {
				fo.closeAll();
				res.send(204);
				next();
				return;
			}
			if (err2) {
				log.error(err2, 'failed to create directory');
				fo.closeAll();
				next(new mod_rerrors.InternalServerError());
				return;
			}
			fo.open('r', function (err3) {
				if (err3) {
					log.error(err3, 'failed to open ' +
					    'child dir');
					next(new mod_rerrors.
					    InternalServerError());
					return;
				}

				res.header('content-type',
				    'application/x-json-stream; type=directory');
				res.header('etag', fo.getMetadata('etag'));
				res.send(200);
				next();
				fo.closeAll();
			});
		});
	});
};

HandlerProvider.prototype.putLink = function putLink(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	res.send(200);
	next();
};

HandlerProvider.prototype.putObject = function putObject(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	res.send(200);
	next();
};

HandlerProvider.prototype.deleteObject = function deleteObject(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	res.send(200);
	next();
};
