// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const status = err.statusCode || 500;
  const message = status === 500 ? 'Internal Server Error' : err.message;
  if (status === 500) console.error(err);
  return res.status(status).json({
    success: false,
    message,
    errors: err.errors || [],
  });
}

export function notFound(_req, res) {
  return res.status(404).json({ success: false, message: 'Route not found', errors: [] });
}
