module.exports = {
	AuthProvider: AuthProvider
};

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
	next();
};

AuthProvider.prototype.parsePresigned =
    function parsePresigned(req, res, next) {
	var state = this.ensureState(req);
	next();
};

function AuthProviderState(req) {
	this.aps_req = req;
}
