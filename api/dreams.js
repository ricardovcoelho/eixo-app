// api/dreams.js
const { handleCrud } = require('./_crud');
module.exports = (req, res) => handleCrud(req, res, 'dreams');
