class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const success = (res, data = null, statusCode = 200) =>
  res.status(statusCode).json({ status: "success", data });

// Express 4 不會自動接住 async 函式的錯誤，要包一層丟給 next
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { AppError, success, asyncHandler };
