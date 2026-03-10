// Vercel Serverless 入口：将 /api/* 请求交给 Express 处理
const serverless = require('serverless-http');
const app = require('../../backend/index.js');
module.exports = serverless(app);
