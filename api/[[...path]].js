let handler;
try {
  const app = require('../backend/index.js');
  handler = app;
} catch (e) {
  handler = (req, res) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Server initialization failed',
      details: e.message,
      stack: e.stack
    }));
  };
}
module.exports = handler;
