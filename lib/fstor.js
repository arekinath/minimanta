var mod_fs = require('fs');
var mod_ffi = require('ffi');

var O_RDONLY = 0;
var O_WRONLY = 1;
var O_RDWR = 2;

var lib_at = mod_ffi.Library(null, {
	'openat': [ 'int', [ 'int', 'string', 'int' ]],
	'unlinkat': [ 'int', [ 'int', 'string', 'int' ]]
});



module.exports = {
};
