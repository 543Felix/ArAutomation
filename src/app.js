const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const AppError = require('./utils/AppError');

const app = express();

app.use(cors());
app.use(express.json());
app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'),
);

app.use(routes);

app.use((_req, _res, next) => {
  next(new AppError('Not Found', 404));
});

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';

  res.status(statusCode).json({ message });
});

module.exports = app;
