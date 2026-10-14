// Consistent success envelope: { success: true, message, data }
export class ApiResponse {
  constructor(message = 'OK', data = null, statusCode = 200) {
    this.success = true;
    this.message = message;
    this.data = data;
    this.statusCode = statusCode;
  }

  send(res) {
    return res.status(this.statusCode).json({
      success: true,
      message: this.message,
      data: this.data,
    });
  }
}
