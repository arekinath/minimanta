module.exports = {
	AuthProvider: AuthProvider
};

var mod_assert = require('assert-plus');
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
	next();
};

AuthProvider.prototype.parsePresigned =
    function parsePresigned(req, res, next) {
	var state = this.ensureState(req);
	var log = req.log.child({ component: 'AuthProvider' });
	next();
};

function AuthProviderState(req) {
	this.aps_req = req;
}
