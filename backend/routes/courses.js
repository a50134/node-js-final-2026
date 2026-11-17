const express = require("express");
const { pool, withTransaction } = require("../config/db");
const { isAuth } = require("../middleware/auth");
const { AppError, success, asyncHandler } = require("../utils/http");
const { isUuid } = require("../utils/validators");

const router = express.Router();

// 全站「進行中」的課程
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.start_at, c.end_at, c.max_participants,
              u.name AS coach_name, s.name AS skill_name
         FROM courses c
         JOIN users u ON u.id = c.user_id
         JOIN skills s ON s.id = c.skill_id
        WHERE c.start_at <= now() AND now() < c.end_at
        ORDER BY c.start_at ASC`,
    );
    success(res, rows);
  }),
);

// 報名：四道檢查，順序不能換
router.post(
  "/:courseId",
  isAuth,
  asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.id;
    if (!isUuid(courseId)) throw new AppError(400, "ID錯誤");

    await withTransaction(async (client) => {
      // 鎖住課程與使用者，避免同時報名造成名額或堂數超賣
      const course = await client.query(
        "SELECT id, max_participants FROM courses WHERE id = $1 FOR UPDATE",
        [courseId],
      );
      if (course.rowCount === 0) throw new AppError(400, "ID錯誤");
      await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
        userId,
      ]);

      //  已有報名紀錄（包含已取消的）
      const existing = await client.query(
        "SELECT 1 FROM course_bookings WHERE user_id = $1 AND course_id = $2",
        [userId, courseId],
      );
      if (existing.rowCount > 0) throw new AppError(400, "已經報名過此課程");

      // 剩餘堂數 = 購買堂數加總 − 未取消的報名數
      const credits = await client.query(
        `SELECT
           (SELECT COALESCE(SUM(purchased_credits), 0)::int
              FROM credit_purchases WHERE user_id = $1) AS purchased,
           (SELECT COUNT(*)::int
              FROM course_bookings
             WHERE user_id = $1 AND cancelled_at IS NULL) AS used`,
        [userId],
      );
      if (credits.rows[0].purchased - credits.rows[0].used <= 0) {
        throw new AppError(400, "已無可使用堂數");
      }

      //  名額已滿
      const active = await client.query(
        `SELECT COUNT(*)::int AS n
           FROM course_bookings
          WHERE course_id = $1 AND cancelled_at IS NULL`,
        [courseId],
      );
      if (active.rows[0].n >= course.rows[0].max_participants) {
        throw new AppError(400, "已達最大參加人數，無法參加");
      }

      await client.query(
        "INSERT INTO course_bookings (user_id, course_id) VALUES ($1, $2)",
        [userId, courseId],
      );
    });

    success(res, null, 201);
  }),
);

// 取消報名
router.delete(
  "/:courseId",
  isAuth,
  asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    if (!isUuid(courseId)) throw new AppError(400, "ID錯誤");

    const result = await pool.query(
      `UPDATE course_bookings
          SET cancelled_at = now()
        WHERE user_id = $1 AND course_id = $2 AND cancelled_at IS NULL`,
      [req.user.id, courseId],
    );
    if (result.rowCount === 0) throw new AppError(400, "ID錯誤");

    success(res, null);
  }),
);

module.exports = router;
