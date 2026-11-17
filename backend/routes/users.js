const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const { isAuth } = require("../middleware/auth");
const { AppError, success, asyncHandler } = require("../utils/http");
const { isNonEmptyString, isValidPassword } = require("../utils/validators");

const router = express.Router();

const PASSWORD_RULE_MSG =
  "密碼不符合規則，需要包含英文數字大小寫，最短8個字，最長16個字";

// 註冊
router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};
    if (
      !isNonEmptyString(name) ||
      !isNonEmptyString(email) ||
      !isNonEmptyString(password)
    ) {
      throw new AppError(400, "欄位未填寫正確");
    }
    if (!isValidPassword(password)) {
      throw new AppError(400, PASSWORD_RULE_MSG);
    }

    const cleanEmail = email.trim();
    const dup = await pool.query("SELECT 1 FROM users WHERE email = $1", [
      cleanEmail,
    ]);
    if (dup.rowCount > 0) throw new AppError(409, "Email 已被使用");

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'USER') RETURNING id, name",
      [name.trim(), cleanEmail, hash],
    );
    success(res, { user: { id: rows[0].id, name: rows[0].name } }, 201);
  }),
);

// 登入
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      throw new AppError(400, "欄位未填寫正確");
    }
    if (!isValidPassword(password)) {
      throw new AppError(400, PASSWORD_RULE_MSG);
    }

    const { rows } = await pool.query(
      "SELECT id, name, password, role FROM users WHERE email = $1",
      [email.trim()],
    );
    const user = rows[0];
    // 帳號不存在與密碼錯誤
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new AppError(400, "使用者不存在或密碼輸入錯誤");
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_DAY || "30d" },
    );
    success(res, { token, user: { name: user.name } }, 201);
  }),
);

// 取得個人資料
router.get("/profile", isAuth, (req, res) => {
  success(res, { user: { name: req.user.name, email: req.user.email } });
});

// 修改暱稱
router.put(
  "/profile",
  isAuth,
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!isNonEmptyString(name)) throw new AppError(400, "欄位未填寫正確");

    const newName = name.trim();
    if (newName === req.user.name) {
      throw new AppError(400, "使用者名稱未變更");
    }

    const result = await pool.query(
      "UPDATE users SET name = $1, updated_at = now() WHERE id = $2 RETURNING name",
      [newName, req.user.id],
    );
    if (result.rowCount === 0) {
      throw new AppError(400, "更新使用者資料失敗");
    }
    success(res, { user: { name: result.rows[0].name } });
  }),
);

// 修改密碼
router.put(
  "/password",
  isAuth,
  asyncHandler(async (req, res) => {
    const {
      password,
      new_password: newPassword,
      confirm_new_password: confirmNewPassword,
    } = req.body || {};

    if (
      !isNonEmptyString(password) ||
      !isNonEmptyString(newPassword) ||
      !isNonEmptyString(confirmNewPassword)
    ) {
      throw new AppError(400, "欄位未填寫正確");
    }
    if (
      !isValidPassword(password) ||
      !isValidPassword(newPassword) ||
      !isValidPassword(confirmNewPassword)
    ) {
      throw new AppError(400, PASSWORD_RULE_MSG);
    }
    if (newPassword === password) {
      throw new AppError(400, "新密碼不能與舊密碼相同");
    }
    if (newPassword !== confirmNewPassword) {
      throw new AppError(400, "新密碼與驗證新密碼不一致");
    }

    const { rows } = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [req.user.id],
    );
    if (!rows[0] || !(await bcrypt.compare(password, rows[0].password))) {
      throw new AppError(400, "密碼輸入錯誤");
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password = $1, updated_at = now() WHERE id = $2",
      [hash, req.user.id],
    );
    success(res, null);
  }),
);

// 我的購買紀錄：新到舊
router.get(
  "/credit-package",
  isAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT name, purchased_credits, price_paid, purchase_at
         FROM credit_purchases
        WHERE user_id = $1
        ORDER BY purchase_at DESC`,
      [req.user.id],
    );
    success(res, rows);
  }),
);

// 我的課表
router.get(
  "/courses",
  isAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const purchased = await pool.query(
      `SELECT COALESCE(SUM(purchased_credits), 0)::int AS total
         FROM credit_purchases WHERE user_id = $1`,
      [userId],
    );
    const bookings = await pool.query(
      `SELECT c.id AS course_id, c.name, c.start_at, c.end_at, c.meeting_url,
              u.name AS coach_name, b.cancelled_at
         FROM course_bookings b
         JOIN courses c ON c.id = b.course_id
         JOIN users u ON u.id = c.user_id
        WHERE b.user_id = $1
        ORDER BY c.start_at ASC`,
      [userId],
    );

    const usage = bookings.rows.filter((b) => b.cancelled_at === null).length;
    success(res, {
      credit_remain: purchased.rows[0].total - usage,
      credit_usage: usage,
      course_booking: bookings.rows,
    });
  }),
);
module.exports = router;
