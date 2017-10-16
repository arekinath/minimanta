module.exports = {
	SplitPath: SplitPath
};

var lib_fstor = require('./fstor');
var mod_sshpk = require('sshpk');
var mod_assert = require('assert-plus');

var TOPLEVEL_DIRS = ['stor', 'public', 'keys'];

function SplitPath(config, req) {
	this.sp_log = req.log.child({ component: 'SplitPath' });
	this.sp_config = config;
	this.sp_req = req;
	this.sp_path = req.path();
	this.sp_parts = [];
	this.sp_unsafe = false;
	this.sp_fstor = undefined;
	this.sp_fingerprint = undefined;

	var self = this;
	var parts = this.sp_path.split('/').slice(1);
	parts.forEach(function (part) {
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
	if (this.sp_parts.length < 2)
		return (false);
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
