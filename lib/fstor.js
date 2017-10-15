module.exports = {
	FstorObject: FstorObject
};

var mod_fs = require('fs');
var mod_ffi = require('ffi');
var mod_assert = require('assert-plus');

var lib_at = mod_ffi.Library(null, {
	'openat': [ 'int', [ 'int', 'string', 'int' ]],
	'unlinkat': [ 'int', [ 'int', 'string', 'int' ]]
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
}

FstorObject.prototype.open = function open(mode, cb) {
	var self = this;
	if (this.fo_fd !== undefined) {
		process.nextTick(cb);
		return;
	}
	mod_fs.open(this.fo_path, mode, function (err, fd) {
		if (err && err.errno === 'enoent') {
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

FstorObject.prototype.getWriteStream = function () {
	var opts = {};
	opts.fd = this.fo_fd;
	opts.autoClose = false;
	opts.start = 0;
	var ws = mod_fs.createWriteStream('not-used', opts);
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
	var metafd = lib_at.openat(fd, 'minimanta.json',
	    mod_fs.constants.O_RDONLY);
	if (metafd < 0) {
		self.fo_meta = null;
		cb();
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
		if (typeof (data) === 'object' && data !== null)
			self.fo_meta = data;
		cb();
	});
};

FstorObject.prototype._writeMeta = function writeMeta(cb) {
	var self = this;
	var metafd = lib_at.openat(fd, 'minimanta.json',
	    mod_fs.constants.O_WRONLY | mod_fs.constants.O_CREAT |
	    mod_fs.constants.O_TRUNC);
	if (metafd < 0) {
		cb(new Error('openat() returned negative'));
		return;
	}
	var opts = {};
	opts.fd = metafd;
	opts.encoding = 'utf-8';
	opts.autoClose = false;
	var ws = mod_fs.createWriteStream('not-used', opts);
	ws.end(JSON.stringify(this.fo_meta));
	ws.on('finish', function () {
		mod_fs.fsync(metafd, function (merr) {
			if (merr) {
				cb(merr);
				return;
			}
			mod_fs.fsync(self.fo_fd, function (err) {
				if (err) {
					cb(err);
					return;
				}
				cb();
			});
		});
	});
};

FstorObject.prototype.sync = function sync(cb) {
	this._writeMeta(cb);
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

FstorObject.prototype.isOpen = function () {
	return (this.fo_fd !== undefined || this.fo_metafd !== undefined);
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
