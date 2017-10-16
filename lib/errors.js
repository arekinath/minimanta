module.exports = {
	DirectoryDoesNotExistError: DirectoryDoesNotExistError,
	DirectoryNotEmptyError: DirectoryNotEmptyError
};

var mod_rerrors  = require('restify-errors');
var mod_util = require('util');

function DirectoryDoesNotExistError() {
	mod_rerrors.RestError.call(this, {
		restCode: 'DirectoryDoesNotExist',
		statusCode: 404,
		message: 'Parent directory does not exist'
	});
}
mod_util.inherits(DirectoryDoesNotExistError, mod_rerrors.RestError);

function DirectoryNotEmptyError() {
	mod_rerrors.RestError.call(this, {
		restCode: 'DirectoryNotEmpty',
		statusCode: 404,
		message: 'Directory is not empty'
	});
}
mod_util.inherits(DirectoryNotEmptyError, mod_rerrors.RestError);
