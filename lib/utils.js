module.exports = {
	SplitPath: SplitPath,
	MimeTypeDb: MimeTypeDb
};

var lib_fstor = require('./fstor');
var mod_sshpk = require('sshpk');
var mod_assert = require('assert-plus');
var mod_fs = require('fs');

var TOPLEVEL_DIRS = ['stor', 'public', 'keys'];

function SplitPath(config, path) {
	this.sp_config = config;
	this.sp_path = path;
	this.sp_parts = [];
	this.sp_unsafe = false;
	this.sp_fstor = undefined;
	this.sp_fingerprint = undefined;

	var self = this;
	var parts = this.sp_path.split('/').slice(1);
	parts.forEach(function (part) {
		part = decodeURIComponent(part);
		if (part === '.')
			return;
		if (part === '..') {
			var parent = self.sp_parts.pop();
			if (parent === undefined)
				self.sp_unsafe = true;
			return;
		}
		if (part[0] === '.') {
			self.sp_unsafe = true;
			return;
		}
		self.sp_parts.push(part);
	});
}

SplitPath.prototype.isValid = function () {
	if (this.sp_unsafe)
		return (false);
	if (this.sp_parts.length < 1)
		return (false);
	if (this.sp_parts.length === 1)
		return (true);
	if (TOPLEVEL_DIRS.indexOf(this.sp_parts[1]) === -1)
		return (false);
	if (this.isKeys() && this.sp_parts.length > 3)
		return (false);
	if (this.isKeys() && this.sp_parts.length === 3 &&
	    this.getKeyFingerprint() === undefined)
		return (false);
	return (true);
};

SplitPath.prototype.getOwner = function () {
	return (this.sp_parts[0]);
};

SplitPath.prototype.isPublic = function () {
	return (this.sp_parts[1] === 'public');
};

SplitPath.prototype.isPrivate = function () {
	return (this.sp_parts[1] === 'stor');
};

SplitPath.prototype.isKeys = function () {
	return (this.sp_parts[1] === 'keys');
};

SplitPath.prototype.getKeyFingerprint = function () {
	mod_assert.ok(this.isKeys());
	if (this.sp_fingerprint === undefined) {
		try {
			var fp = mod_sshpk.parseFingerprint(this.sp_parts[2]);
			this.sp_fingerprint = fp;
		} catch (err) {
			if (err.name === 'FingerprintFormatError')
				return (undefined);
			else
				throw (err);
		}
	}
	return (this.sp_fingerprint);
};

SplitPath.prototype.getFstorObject = function () {
	mod_assert.ok(this.isValid());
	if (this.sp_fstor === undefined) {
		var parts = this.sp_parts.slice();
		parts.unshift(this.sp_config.root);
		this.sp_fstor = new lib_fstor.FstorObject(this.sp_config,
		    parts);
	}
	return (this.sp_fstor);
};

function MimeTypeDb(config) {
	this.mt_config = config;
	this.mt_path = config.mime_db;
	this.mt_mimemap = {};
	this.mt_extmap = {};
	this._parse();
}

MimeTypeDb.prototype.nameToType = function (name) {
	var parts = name.split('.');
	return (this.mt_extmap[parts.pop()]);
};

MimeTypeDb.prototype._parse = function parseMimeTypes() {
	var data = mod_fs.readFileSync(this.mt_path, 'utf-8');
	var idx = 0;

	var ws = /^[ \t\n]+/;
	var opencurly = /^[{]/;
	var word = /^[^ \t\n;}{]+/;
	var semi = /^;/;
	var closecurly = /^[}]/;

	function eat(re) {
		var ret = re.exec(data.slice(idx));
		if (ret !== null) {
			idx += ret[0].length;
			return (ret[0]);
		}
		return (ret);
	}

	mod_assert.ok(eat(ws));
	mod_assert.strictEqual(eat(word), 'types');
	eat(ws);
	mod_assert.ok(eat(opencurly));
	while (true) {
		var type, ext;
		var exts = [];
		eat(ws);
		if (eat(closecurly))
			break;
		type = eat(word);
		mod_assert.ok(type);
		while (true) {
			eat(ws);
			if (eat(semi))
				break;
			ext = eat(word);
			mod_assert.ok(ext);
			exts.push(ext);
			this.mt_extmap[ext] = type;
		}
		this.mt_mimemap[type] = exts;
	}
};
