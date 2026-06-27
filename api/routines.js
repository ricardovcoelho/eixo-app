// api/routines.js
const { handleCrud } = require('./_crud');
module.exports = (req, res) => handleCrud(req, res, 'routines');
