/** Wraps an async route handler so rejections reach the error middleware. */
export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const forbidden = (msg = 'Not allowed') => new HttpError(403, msg);

export function errorHandler(err, req, res, _next) {
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) console.error('[error]', err);

  let message = err.message || 'Something went wrong';
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    message = `That ${field} is already registered`;
    return res.status(409).json({ message });
  }
  return res.status(status).json({ message });
}
