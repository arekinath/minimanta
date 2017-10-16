module.exports = {
	AuthProvider: AuthProvider
};

var mod_assert = require('assert-plus');
var mod_httpsig = require('http-signature');
var mod_sshpk = require('sshpk');
var mod_rerrors  = require('restify-errors');
var mod_verror = require('verror');

var lib_utils = require('./utils');
var lib_fstor = require('./fstor');

function AuthProvider(config) {
	this.ap_config = config;
}

AuthProvider.prototype.ensureState = function ensureState(req) {
	if (req.authProviderState === undefined) {
		req.authProviderState = new AuthProviderState(req);
	}
	return (req.authProviderState);
}

AuthProvider.prototype.parseAuthorization =
    function parseAuthorization(req, res, next) {
	var state = this.ensureState(req);
	var log = req.log.child({ component: 'AuthProvider' });

	if (req.header('authorization') === undefined) {
		next();
		return;
	}

	var authz;
	try {
		authz = mod_httpsig.parseRequest(req, {});
	} catch (ex) {
		log.error(ex, 'failed to parse authorization header');
		next(new mod_rerrors.BadRequestError('Failed to parse ' +
		    'Authorization header'));
		return;
	}

	var sp = new lib_utils.SplitPath(this.ap_config, authz.params.keyId);
	if (!sp.isValid() || !sp.isKeys()) {
		next(new mod_rerrors.UnauthorizedError());
		return;
	}

	var parts = authz.params.algorithm.split('-');
	var hashalg = parts[1];
	var sig = mod_sshpk.parseSignature(
	    authz.params.signature, parts[0], 'asn1');

	state.setPrincipal(sp.getOwner());
	state.setSignature(authz.signingString, hashalg, sig);
	state.setKeyFO(sp.getFstorObject());

	next();
};

function rfc3986(str) {
	/* JSSTYLED */
	return (encodeURIComponent(str)
	    /* JSSTYLED */
	    .replace(/[!'()]/g, escape)
	    /* JSSTYLED */
	    .replace(/\*/g, '%2A'));
}

AuthProvider.prototype.parsePresigned =
    function parsePresigned(req, res, next) {
	var state = this.ensureState(req);
	var log = req.log.child({ component: 'AuthProvider' });

	if (state.getPrincipal() !== undefined) {
		next();
		return;
	}

	var methods = (req.query.method || req.method).split(',');
	methods.sort();

	var now = Math.floor(Date.now() / 1000);

	if (methods.indexOf(req.method) === -1) {
		next();
		return;
	}

	var missing = ['algorithm', 'expires', 'keyId', 'signature'];
	missing = missing.filter(function (k) {
		return (req.query[k] === undefined);
	});
	if (missing.length > 0) {
		next();
		return;
	}

	try {
		var expires = parseInt(req.query.expires, 10);
	} catch (e) {
		next();
		return;
	}
	if (!isFinite(expires)) {
		next();
		return;
	}

	if (now > expires) {
		next(new mod_rerrors.BadRequestError(
		    'Presigned URL has expired'));
		return;
	}

	var sp = new lib_utils.SplitPath(this.ap_config, req.query['keyId']);
	if (!sp.isValid() || !sp.isKeys()) {
		next(new mod_rerrors.UnauthorizedError());
		return;
	}

	var parts = req.query['algorithm'].split('-');
	var hashalg = parts[1];
	var sig = mod_sshpk.parseSignature(
	    req.query['signature'], parts[0], 'asn1');

	var sigstr =
	    methods.join(',') + '\n' +
	    req.header('host') + '\n' +
	    req.path() + '\n' +
	    Object.keys(req.query).sort(function (a, b) {
		return (a.localeCompare(b));
	    }).filter(function (k) {
		return (k.toLowerCase() !== 'signature');
	    }).map(function (k) {
		return (rfc3986(k) + '=' + rfc3986(req.query[k]));
	    }).join('&');

	state.setPrincipal(sp.getOwner());
	state.setSignature(sigstr, hashalg, sig);
	state.setKeyFO(sp.getFstorObject());

	next();
};

AuthProvider.prototype.checkIsOper = function (user, cb) {
	var fo = new lib_fstor.FstorObject(this.ap_config,
	    [this.ap_config.root, user]);
	fo.open('r', function (err) {
		if (err) {
			cb(err);
			fo.closeAll();
			return;
		}

		if (!fo.exists() || !fo.isDirectory()) {
			cb(new Error('Invalid user'));
			fo.closeAll();
			return;
		}

		if (fo.getMetadata('operator') !== true) {
			cb(new Error('Not an operator'));
			fo.closeAll();
			return;
		}
		fo.closeAll();
		cb();
	});
};

AuthProvider.prototype.authorize = function authorize(req, res, next) {
	var state = this.ensureState(req);
	var log = req.log.child({ component: 'AuthProvider' });
	var sp = req.splitPath;
	var rt = req.getRoute();
	var self = this;

	if (sp.isPublic() && (rt.name === 'GetObject' ||
	    rt.name === 'HeadObject' || rt.name === 'OptionsObject')) {
		next();
		return;
	}

	if (state.getPrincipal() === undefined) {
		next(new mod_rerrors.UnauthorizedError());
		return;
	}

	state.validateSignature(function (err) {
		if (err) {
			log.debug(err, 'failed to validate signature');
			next(new mod_rerrors.UnauthorizedError());
			return;
		}

		if (state.getPrincipal() !== sp.getOwner()) {
			self.checkIsOper(state.getPrincipal(), function (err) {
				if (err) {
					next(new mod_rerrors.ForbiddenError());
					return;
				}
				next();
			});
			return;
		}

		next();
	});
};

function AuthProviderState(req) {
	this.aps_req = req;
	this.aps_principal = undefined;
	this.aps_sigblob = undefined;
	this.aps_sig = undefined;
	this.aps_key_fo = undefined;
	this.aps_hashalg = undefined;
}

AuthProviderState.prototype.setPrincipal = function (principal) {
	this.aps_principal = principal;
};

AuthProviderState.prototype.getPrincipal = function () {
	return (this.aps_principal);
};

AuthProviderState.prototype.setSignature = function (blob, hashalg, sig) {
	this.aps_sigblob = blob;
	this.aps_hashalg = hashalg;
	this.aps_sig = sig;
};

AuthProviderState.prototype.setKeyFO = function (fo) {
	this.aps_key_fo = fo;
};

AuthProviderState.prototype.validateSignature = function (cb) {
	var self = this;
	var fo = this.aps_key_fo;

	fo.open('r', function (err) {
		if (err) {
			cb(new mod_verror.VError(err, 'Failed to open key ' +
			    'file during auth'));
			fo.closeAll();
			return;
		}

		if (!fo.exists() || !fo.isObject()) {
			cb(new mod_verror.VError(
			    'Key file "%s" does not exist', fo.getBasename()));
			fo.closeAll();
			return;
		}

		var rs = fo.getReadStream();
		var buf = new Buffer(0);
		rs.on('readable', function () {
			var chunk;
			while ((chunk = rs.read()) !== null) {
				buf = Buffer.concat([buf, chunk]);
			}
		});
		rs.on('end', function () {
			fo.closeAll();
			try {
				var pubkey = mod_sshpk.parseKey(buf, 'auto');
			} catch (err) {
				cb(new mod_verror.VError(err,
				    'Key file "%s" is invalid',
				    fo.getBasename()));
				return;
			}

			var v = pubkey.createVerify(self.aps_hashalg);
			v.update(self.aps_sigblob);
			if (!v.verify(self.aps_sig)) {
				cb(new mod_verror.VError("Signature invalid"));
				return;
			}
			cb();
		});
	})
};
