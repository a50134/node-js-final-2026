const express = require("express");
const { pool } = require("../config/db");
const { isAuth } = require("../middleware/auth");
const { AppError, success, asyncHandler } = require("../utils/http");
const {
  isNonEmptyString,
  isNonNegativeInt,
  isUuid,
} = require("../utils/validators");

const router = express.Router();

// 方案列表
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name, credit_amount, price FROM credit_packages ORDER BY created_at ASC, name ASC",
    );
    success(res, rows);
  }),
);

// 新增方案
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, credit_amount: creditAmount, price } = req.body || {};
    if (
      !isNonEmptyString(name) ||
      !isNonNegativeInt(creditAmount) ||
      !isNonNegativeInt(price)
    ) {
      throw new AppError(400, "欄位未填寫正確");
    }

    const trimmed = name.trim();
    const dup = await pool.query(
      "SELECT 1 FROM credit_packages WHERE name = $1",
      [trimmed],
    );
    if (dup.rowCount > 0) throw new AppError(409, "資料重複");

    const { rows } = await pool.query(
      `INSERT INTO credit_packages (name, credit_amount, price)
       VALUES ($1, $2, $3)
       RETURNING id, name, credit_amount, price, created_at AS "createdAt"`,
      [trimmed, creditAmount, price],
    );
    success(res, rows[0]);
  }),
);

// 購買方案：body 留空，堂數與金額由後端依方案資料帶入
router.post(
  "/:creditPackageId",
  isAuth,
  asyncHandler(async (req, res) => {
    const { creditPackageId } = req.params;
    if (!isUuid(creditPackageId)) throw new AppError(400, "ID錯誤");

    const pkg = await pool.query(
      "SELECT id, name, credit_amount, price FROM credit_packages WHERE id = $1",
      [creditPackageId],
    );
    if (pkg.rowCount === 0) throw new AppError(400, "ID錯誤");

    const p = pkg.rows[0];
    await pool.query(
      `INSERT INTO credit_purchases (user_id, credit_package_id, name, purchased_credits, price_paid)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, p.id, p.name, p.credit_amount, p.price],
    );
    success(res, null);
  }),
);

// 刪除方案
router.delete(
  "/:creditPackageId",
  asyncHandler(async (req, res) => {
    const { creditPackageId } = req.params;
    if (!isUuid(creditPackageId)) throw new AppError(400, "ID錯誤");

    const result = await pool.query(
      "DELETE FROM credit_packages WHERE id = $1",
      [creditPackageId],
    );
    if (result.rowCount === 0) throw new AppError(400, "ID錯誤");

    success(res, { raw: [], affected: result.rowCount });
  }),
);

module.exports = router;
