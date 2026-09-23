/** The one error type the services throw. The router turns it into a JSON response. */
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

export const badRequest = (m) => new AppError(400, m);
export const unauthorized = (m = 'Sign in first') => new AppError(401, m);
export const notFound = (m = 'Not found') => new AppError(404, m);
export const conflict = (m) => new AppError(409, m);
