module.exports = {
	HandlerProvider: HandlerProvider
};

var mod_assert = require('assert-plus');
var mod_vasync = require('vasync');
var mod_rerrors  = require('restify-errors');

var lib_errors = require('./errors');

function HandlerProvider(config) {
	this.hp_config = config;
}

HandlerProvider.prototype.headObject = function headObject(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	var fo = req.splitPath.getFstorObject();
	fo.open('r', function (err) {
		if (err) {
			log.error(err, 'failed to head object');
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
			res.header('content-md5',
			    fo.getMetadata('content-md5'));
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
	var etag = req.header('if-none-match');
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
			if (etag === fo.getMetadata('etag')) {
				res.send(304);
				fo.closeAll();
				next();
			} else {
				res.status(200);
				fo.writeDirToStream(res, function (err) {
					fo.closeAll();
					next(err);
				});
			}

		} else if (fo.isObject()) {
			res.header('content-type',
			    fo.getMetadata('content-type'));
			res.header('etag', fo.getMetadata('etag'));
			res.header('content-length', fo.getSize());
			res.header('content-md5',
			    fo.getMetadata('content-md5'));
			res.header('last-modified',
			    fo.getmtime().toUTCString());
			if (etag === fo.getMetadata('etag')) {
				res.send(304);
				fo.closeAll();
				next();
			} else {
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
	mod_vasync.pipeline({
		funcs: [openParent, doMkdir, openChild],
		input: {}
	}, function (err) {
		fo.closeAll();
		if (!err)
			res.end();
		next(err);
	});
	function openParent(_, ccb) {
		pfo.open('r', function (err) {
			if (err) {
				log.error(err, 'failed to open parent dir');
				ccb(new mod_rerrors.InternalServerError());
				return;
			}
			if (!pfo.exists()) {
				ccb(new mod_rerrors.NotFoundError(
				    'Parent directory does not exist'));
				return;
			}
			if (!pfo.isDirectory()) {
				ccb(new mod_rerrors.BadRequestError(
				    'Parent is not a directory'));
				return;
			}
			ccb();
		});
	}
	function doMkdir(_, ccb) {
		fo.mkdir(function (err) {
			if (err && err.code === 'EEXIST') {
				res.status(204);
				ccb();
				return;
			}
			if (err) {
				log.error(err, 'failed to create directory');
				ccb(new mod_rerrors.InternalServerError());
				return;
			}
			res.status(200);
			ccb();
		});
	}
	function openChild(_, ccb) {
		fo.open('r', function (err) {
			if (err) {
				log.error(err, 'failed to open child dir');
				ccb(new mod_rerrors.InternalServerError());
				return;
			}

			res.header('content-type',
			    'application/x-json-stream; type=directory');
			res.header('etag', fo.getMetadata('etag'));
			ccb();
		});
	}
};

HandlerProvider.prototype.putLink = function putLink(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	res.send(200);
	next();
};

HandlerProvider.prototype.putObject = function putObject(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	var fo = req.splitPath.getFstorObject();
	var etag = req.header('if-match');
	var mdataonly = (req.query['metadata'] === 'true');
	var defMimeType = this.hp_config.mime.nameToType(fo.getBasename());
	if (defMimeType === undefined)
		defMimeType = 'application/octet-stream';
	var pfo = fo.getParent();
	pfo.open('r', function (err) {
		if (err) {
			log.error(err, 'failed to open parent dir');
			fo.closeAll();
			next(new mod_rerrors.InternalServerError());
			req.resume();
			return;
		}

		if (!pfo.exists()) {
			next(new lib_errors.DirectoryDoesNotExistError());
			fo.closeAll();
			req.resume();
			return;
		}

		if (!pfo.isDirectory()) {
			next(new mod_rerrors.BadRequestError());
			fo.closeAll();
			req.resume();
			return;
		}

		fo.open('r', function (err) {
			if (err) {
				log.error(err, 'failed to open file');
				fo.closeAll();
				next(new mod_rerrors.InternalServerError());
				return;
			}

			if (etag !== undefined &&
			    fo.getMetadata('etag') !== etag) {
				fo.closeAll();
				res.send(412);
				req.resume();
				next();
				return;
			}

			fo.setMetadata('content-type', req.header(
			    'content-type', defMimeType));

			if (mdataonly) {
				fo.sync(function (err) {
					fo.closeAll();
					res.send(204);
					next();
				});
				return;
			}

			fo.getAtomicWriteStream(doWrite, function (err) {
				if (err) {
					log.error(err, 'failed to write data');
					next(new mod_rerrors.
					    InternalServerError());
					req.resume();
					fo.closeAll();
					return;
				}

				res.header('etag', fo.getMetadata('etag'));
				res.header('content-md5',
				    fo.getMetadata('content-md5'));
				res.send(204);
				fo.closeAll();
				next();
			});
			function doWrite(err, ws) {
				if (!err)
					req.pipe(ws);
				else
					req.resume();
				req.on('aborted', function () {
					ws.emit('error', new Error('Aborted'));
				});
			}
		});
	});
};

HandlerProvider.prototype.deleteObject = function deleteObject(req, res, next) {
	var log = req.log.child({ component: 'HandlerProvider' });
	var fo = req.splitPath.getFstorObject();
	var etag = req.header('if-match');
	var pfo = fo.getParent();
	pfo.open('r', function (err) {
		if (err) {
			log.error(err, 'failed to open parent dir');
			fo.closeAll();
			next(new mod_rerrors.InternalServerError());
			return;
		}

		if (!pfo.exists()) {
			next(new mod_rerrors.NotFoundError());
			fo.closeAll();
			return;
		}

		if (!pfo.isDirectory()) {
			next(new mod_rerrors.BadRequestError());
			fo.closeAll();
			return;
		}

		fo.open('r', function (err) {
			if (err) {
				log.error(err, 'failed to open file');
				fo.closeAll();
				next(new mod_rerrors.InternalServerError());
				return;
			}

			if (!fo.exists()) {
				next(new mod_rerrors.NotFoundError());
				fo.closeAll();
				return;
			}

			if (etag !== undefined &&
			    etag !== fo.getMetadata('etag')) {
				res.send(412);
				fo.closeAll();
				next();
				return;
			}

			fo.unlink(function (err) {
				if (err &&
				    err.code.toLowerCase() === 'eexist' &&
				    fo.isDirectory()) {
					next(new lib_errors.
					    DirectoryNotEmptyError());
					fo.closeAll();
					return;
				}
				if (err) {
					log.error(err, 'failed to unlink');
					next(new mod_rerrors.
					    InternalServerError());
					fo.closeAll();
					return;
				}

				res.send(204);
				fo.closeAll();
				next();
			});
		});
	});
};
