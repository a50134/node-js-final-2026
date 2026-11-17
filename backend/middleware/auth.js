const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const { AppError, asyncHandler } = require("../utils/http");
const { isUuid } = require("../utils/validators");

const isAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    throw new AppError(401, "請先登入");
  const token = header.slice(7).trim();
  if (!token) throw new AppError(401, "請先登入");

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError")
      throw new AppError(401, "Token 已過期");
    throw new AppError(401, "無效的 token");
  }

  if (!isUuid(payload.id)) throw new AppError(401, "無效的 token");
  const { rows } = await pool.query(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [payload.id],
  );
  if (rows.length === 0) throw new AppError(401, "無效的 token");

  req.user = rows[0]; // 之後的程式就能用 req.user 知道「現在是誰」
  next();
});

const isCoach = (req, res, next) => {
  if (!req.user || req.user.role !== "COACH") {
    return next(new AppError(401, "使用者尚未成為教練"));
  }
  next();
};

module.exports = { isAuth, isCoach };
