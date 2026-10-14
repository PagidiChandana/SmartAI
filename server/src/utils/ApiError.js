// Consistent error: { success: false, message, errors[] }
export class ApiError extends Error {
  constructor(statusCode = 500, message = 'Internal Server Error', errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
