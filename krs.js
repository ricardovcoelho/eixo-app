// api/krs.js
const { handleCrud } = require('./_crud');
module.exports = (req, res) => handleCrud(req, res, 'krs');
