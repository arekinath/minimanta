module.exports = {
	HandlerProvider: HandlerProvider
};

function HandlerProvider(config) {
	this.hp_config = config;
}

HandlerProvider.prototype.headObject = function headObject(req, res, next) {
	next();
};

HandlerProvider.prototype.getObject = function getObject(req, res, next) {
	next();
};

HandlerProvider.prototype.cors = function cors(req, res, next) {
	next();
};

HandlerProvider.prototype.putDirectory = function putDirectory(req, res, next) {
	next();
};

HandlerProvider.prototype.putLink = function putLink(req, res, next) {
	next();
};

HandlerProvider.prototype.putObject = function putObject(req, res, next) {
	next();
};

HandlerProvider.prototype.deleteObject = function deleteObject(req, res, next) {
	next();
};
