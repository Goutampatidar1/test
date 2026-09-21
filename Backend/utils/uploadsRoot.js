const path = require("path");

/** Always Backend/uploads, regardless of process.cwd(). */
module.exports = path.join(__dirname, "..", "uploads");
