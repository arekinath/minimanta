module.exports = {
	FstorObject: FstorObject
};

var mod_fs = require('fs');
var mod_ffi = require('ffi');
var mod_assert = require('assert-plus');
var mod_crypto = require('crypto');
var mod_vasync = require('vasync');
var mod_verror = require('verror');

var O_RDONLY = 0;
var O_WRONLY = 1;
var O_RDWR = 2;
var O_CREAT = 0x100;
var O_TRUNC = 0x200;
var O_EXCL = 0x400;
var O_XATTR = 0x4000;

var AT_REMOVEDIR = 0x1;

var ERRNO = {
	EPERM: 1,
	ENOENT: 2,
	ESRCH: 3,
	EINTR: 4,
	EIO: 5,
	ENXIO: 6,
	E2BIG: 7,
	ENOEXEC: 8,
	EBADF: 9,
	ECHILD: 10,
	EAGAIN: 11,
	ENOMEM: 12,
	EACCES: 13,
	EFAULT: 14,
	ENOTBLK: 15,
	EBUSY: 16,
	EEXIST: 17,
	ENODEV: 19,
	ENOTDIR: 20,
	EISDIR: 21,
	EINVAL: 22,
	EBADF: 9
};
var ERRNO_R = {};
Object.keys(ERRNO).forEach(function (k) {
	ERRNO_R[ERRNO[k]] = k;
});

function perror(func) {
	var errno = mod_ffi.errno();
	var code = ERRNO_R[errno];
	if (code === undefined)
		code = '' + errno;
	var e = new Error(func + '() failed: ' + code);
	e.code = code;
	e.errno = errno;
	return (e);
}

var lib_at = mod_ffi.Library(null, {
	'openat': [ 'int', [ 'int', 'string', 'int', 'int' ]],
	'unlinkat': [ 'int', [ 'int', 'string', 'int' ]],
	'renameat': [ 'int', [ 'int', 'string', 'int', 'string' ]],
	'mkdirat': [ 'int', [ 'int', 'string', 'int' ]]
});

function FstorObject(config, parts) {
	this.fo_config = config;
	this.fo_pathParts = parts;
	this.fo_path = parts.join('/');
	this.fo_basename = parts[parts.length - 1];
	this.fo_exists = undefined;
	this.fo_fd = undefined;
	this.fo_meta = undefined;
	this.fo_stats = undefined;
	this.fo_parent = undefined;
	this.fo_children = {};
}

FstorObject.prototype.open = function open(mode, cb) {
	var self = this;
	if (this.fo_fd !== undefined) {
		process.nextTick(cb);
		return;
	}
	mod_fs.open(this.fo_path, mode, function (err, fd) {
		if (err && err.code.toLowerCase() === 'enoent') {
			self.fo_exists = false;
			cb();
			return;
		} else if (err) {
			cb(err);
			return;
		}
		self.fo_exists = true;
		self.fo_fd = fd;
		mod_fs.fstat(fd, function (err2, stats) {
			if (err2) {
				cb(err2);
				return;
			}
			self.fo_stats = stats;
			if (stats.isFile() || stats.isDirectory()) {
				self._readMeta(cb);
			}
		});
	});
};

FstorObject.prototype.getAtomicWriteStream = function (writecb, cb) {
	var self = this;
	var etag = mod_crypto.randomBytes(8).toString('hex');
	this.setMetadata('etag', etag);
	var tmpfile = '.' + this.fo_basename + '.' +
	    process.pid + '.' + etag;
	var parent = this.getParent();
	this.close();
	var ws, tmp;
	mod_vasync.pipeline({
		funcs: [openParent, openChild, setupStream, syncTmpfile,
		    renameAt, syncAgain, syncParent]
	}, function (err) {
		if (err && writecb !== null) {
			writecb(err);
		}
		if (err) {
			cb(err);
			return;
		}
		cb();
	});
	function openParent(_, ccb) {
		parent.open('r', ccb);
	}
	function openChild(_, ccb) {
		tmp = parent.getChild(tmpfile);
		tmp.open('w', ccb);
	}
	function setupStream(_, ccb) {
		tmp.fo_meta = self.fo_meta;
		ws = tmp.getWriteStream();
		ws.on('finish', ccb);
		writecb(null, ws);
		writecb = null;
	}
	function syncTmpfile(_, ccb) {
		tmp.close();
		tmp.open('r+', function (err) {
			if (err) {
				ccb(err);
				return;
			}
			tmp.sync(ccb);
		})
	}
	function renameAt(_, ccb) {
		var rc = lib_at.renameat(parent.fo_fd, tmpfile, parent.fo_fd,
		    self.fo_basename);
		if (rc === 0) {
			ccb();
		} else {
			ccb(perror('renameat'));
		}
	}
	function syncAgain(_, ccb) {
		tmp.sync(function (err) {
			tmp.close();
			ccb(err);
		});
	}
	function syncParent(_, ccb) {
		parent.sync(ccb);
	}
}

FstorObject.prototype.getWriteStream = function () {
	var self = this;
	var opts = {};
	opts.fd = this.fo_fd;
	opts.start = 0;
	var ws = mod_fs.createWriteStream('not-used', opts);
	ws.on('finish', function () {
		/* WriteStream always closes at end */
		self.fo_fd = undefined;
	});
	return (ws);
};

FstorObject.prototype.getReadStream = function () {
	var opts = {};
	opts.fd = this.fo_fd;
	opts.autoClose = false;
	opts.start = 0;
	var rs = mod_fs.createReadStream('not-used', opts);
	return (rs);
};

FstorObject.prototype._readMeta = function readMeta(cb) {
	var self = this;
	var metafd = lib_at.openat(self.fo_fd, 'minimanta.json',
	    O_RDONLY | O_XATTR, 0);
	if (metafd < 0) {
		var err = perror('openat');
		if (err.code === 'ENOENT') {
			writeDefaultMeta()
		} else {
			cb(new mod_verror.VError(err, 'Failed to open ' +
			    'metadata fork for %s', this.fo_path));
		}
		return;
	}
	var opts = {};
	opts.fd = metafd;
	opts.encoding = 'utf-8';
	var rs = mod_fs.createReadStream('not-used', opts);
	var data = '';
	rs.on('readable', function () {
		var chunk;
		while ((chunk = rs.read()) !== null)
			data += chunk;
	});
	rs.on('end', function () {
		data = JSON.parse(data);
		if (typeof (data) === 'object' && data !== null) {
			self.fo_meta = data;
			cb();
		} else {
			writeDefaultMeta();
		}
	});

	function writeDefaultMeta() {
		var etag = mod_crypto.randomBytes(8).toString('hex');
		self.fo_meta = {};
		self.fo_meta.etag = etag;
		self.fo_meta['content-type'] = 'application/octet-stream';
		self._writeMeta(cb);
	}
};

FstorObject.prototype._writeMeta = function writeMeta(cb) {
	var self = this;
	var metafd = lib_at.openat(self.fo_fd, 'minimanta.json',
	    O_WRONLY | O_CREAT | O_TRUNC | O_XATTR, 0x1a4);
	if (metafd < 0) {
		cb(new mod_verror.VError(perror('openat'),
		    'failed to open metadata for for writing: %s',
		    self.fo_path));
		return;
	}
	var opts = {};
	opts.fd = metafd;
	opts.encoding = 'utf-8';
	var ws = mod_fs.createWriteStream('not-used', opts);
	var ret = ws.write(JSON.stringify(this.fo_meta));
	if (ret === false) {
		ws.on('drain', syncMeta);
	} else {
		syncMeta();
	}
	function syncMeta() {
		mod_fs.fsync(metafd, function (merr) {
			ws.end();
			if (merr) {
				cb(new mod_verror.VError(merr,
				    'failed to fsync metadata fork for %s',
				    self.fo_path));
				return;
			}
			mod_fs.fsync(self.fo_fd, function (err) {
				if (err) {
					cb(new mod_verror.VError(err,
					    'failed to fsync %s',
					    self.fo_path));
					return;
				}
				cb();
			});
		});
	}
};

FstorObject.prototype.sync = function sync(cb) {
	this._writeMeta(cb);
};

FstorObject.prototype.mkdir = function mkdir(cb) {
	var parent = this.getParent();
	mod_assert.ok(parent.isOpen());
	var rc = lib_at.mkdirat(parent.fo_fd, this.fo_basename, 0x1ed);
	if (rc < 0) {
		cb(perror('mkdirat'));
		return;
	}
	parent.sync(cb);
};

FstorObject.prototype.close = function close() {
	if (this.fo_fd !== undefined) {
		mod_fs.closeSync(this.fo_fd);
		this.fo_fd = undefined;
	}
	if (this.fo_metafd !== undefined) {
		mod_fs.closeSync(this.fo_metafd);
		this.fo_metafd = undefined;
	}
};

FstorObject.prototype.closeAll = function closeAll() {
	var parent = this.fo_parent;
	var children = this.fo_children;
	this.fo_parent = undefined;
	this.fo_children = {};

	this.close();
	if (parent !== undefined)
		parent.closeAll();
	Object.keys(children).forEach(function (fn) {
		children[fn].closeAll();
	});
};

FstorObject.prototype.unlink = function unlink(cb) {
	var parent = this.getParent();
	mod_assert.ok(parent.isOpen());
	var flags = 0;
	if (this.isDirectory())
		flags |= AT_REMOVEDIR;
	var rc = lib_at.unlinkat(parent.fo_fd, this.fo_basename, flags);
	if (rc < 0) {
		cb(perror('unlinkat'));
		return;
	}
	parent.sync(cb);
};

FstorObject.prototype.getBasename = function () {
	return (this.fo_basename);
};

FstorObject.prototype.setMetadata = function (k, v) {
	if (this.fo_meta === undefined)
		this.fo_meta = {};
	this.fo_meta[k] = v;
};

FstorObject.prototype.getMetadata = function (k) {
	if (this.fo_meta === undefined)
		return (undefined);
	return (this.fo_meta[k]);
};

FstorObject.prototype.getParent = function () {
	if (this.fo_parent === undefined) {
		var path = this.fo_pathParts.slice();
		path.pop();
		this.fo_parent = new FstorObject(this.fo_config, path);
	}
	return (this.fo_parent);
};

FstorObject.prototype.getChild = function (name) {
	mod_assert.ok(this.isDirectory());
	if (this.fo_children[name] === undefined) {
		var path = this.fo_pathParts.slice();
		path.push(name);
		var fo = new FstorObject(this.fo_config, path);
		fo.fo_parent = this;
		this.fo_children[name] = fo;
	}
	return (this.fo_children[name]);
};

FstorObject.prototype.getChildren = function (cb) {
	var self = this;
	mod_assert.ok(this.isDirectory());
	mod_fs.readdir(this.fo_path, function (err, fnames) {
		if (err) {
			cb(err);
			return;
		}
		var objs = [];
		fnames.forEach(function (fname) {
			if (fname[0] === '.')
				return;
			objs.push(self.getChild(fname));
		});
		cb(null, objs);
	});
};

FstorObject.prototype.isOpen = function () {
	return (this.fo_fd !== undefined);
};

FstorObject.prototype.exists = function () {
	return (this.fo_exists);
};

FstorObject.prototype.writeDirToStream = function (str, cb) {
	var self = this;
	mod_assert.ok(this.isDirectory());
	this.getChildren(function (err, kids) {
		mod_vasync.forEachPipeline({
			func: writeKidJson,
			inputs: kids
		}, function (err) {
			if (!err)
				str.end();
			cb(err);
		});
		function writeKidJson(kid, ccb) {
			kid.open('r', function kidOpen(err) {
				if (err) {
					ccb(err);
					return;
				}
				var obj = {};
				obj.name = kid.getBasename();
				if (kid.isDirectory())
					obj.type = 'directory';
				if (kid.isObject()) {
					obj.type = 'object';
					obj.size = kid.getSize();
					obj.durability = 1;
				}
				obj.etag = kid.getMetadata('etag');
				obj.mtime = kid.getmtime().toISOString();
				var line = JSON.stringify(obj) + '\n';
				if (str.write(line) === false) {
					str.once('drain', ccb);
				} else {
					ccb();
				}
			});
		}
	});
};

FstorObject.prototype.getSize = function () {
	if (this.fo_stats === undefined)
		return (0);
	return (this.fo_stats.size);
};

FstorObject.prototype.getmtime = function () {
	if (this.fo_stats === undefined)
		return (new Date());
	return (this.fo_stats.mtime);
};

FstorObject.prototype.isDirectory = function isDirectory() {
	if (this.fo_stats === undefined)
		return (false);
	return (this.fo_stats.isDirectory());
};

FstorObject.prototype.isObject = function isObject() {
	if (this.fo_stats === undefined)
		return (false);
	return (this.fo_stats.isFile());
};
