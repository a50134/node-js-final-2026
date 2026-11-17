const express = require("express");
const { pool } = require("../config/db");
const { AppError, success, asyncHandler } = require("../utils/http");
const { isNonEmptyString, isUuid } = require("../utils/validators");

const router = express.Router();

// 技能列表
router.get(
  "/skill",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name FROM skills ORDER BY created_at ASC, name ASC",
    );
    success(res, rows);
  }),
);

// 新增技能
router.post(
  "/skill",
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!isNonEmptyString(name)) throw new AppError(400, "欄位未填寫正確");

    const trimmed = name.trim();
    const dup = await pool.query("SELECT 1 FROM skills WHERE name = $1", [
      trimmed,
    ]);
    if (dup.rowCount > 0) throw new AppError(409, "資料重複");

    const { rows } = await pool.query(
      'INSERT INTO skills (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"',
      [trimmed],
    );
    success(res, rows[0]);
  }),
);

// 刪除技能
router.delete(
  "/skill/:skillId",
  asyncHandler(async (req, res) => {
    const { skillId } = req.params;
    if (!isUuid(skillId)) throw new AppError(400, "ID錯誤");

    const result = await pool.query("DELETE FROM skills WHERE id = $1", [
      skillId,
    ]);
    if (result.rowCount === 0) throw new AppError(400, "ID錯誤");

    success(res, { raw: [], affected: result.rowCount });
  }),
);

// 教練分頁列表：per、page 都必填，且必須是非負整數
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { per, page } = req.query;
    const isNonNegIntStr = (v) => typeof v === "string" && /^\d+$/.test(v);
    if (!isNonNegIntStr(per) || !isNonNegIntStr(page)) {
      throw new AppError(400, "欄位未填寫正確");
    }

    const limit = Number(per);
    const offset = Math.max(Number(page) - 1, 0) * limit;

    const { rows } = await pool.query(
      `SELECT c.id, c.user_id, u.name
         FROM coaches c
         JOIN users u ON u.id = c.user_id
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    success(res, rows);
  }),
);

// 以教練 id 找教練；找不到就丟錯
async function findCoachOrThrow(coachId) {
  if (!isUuid(coachId)) throw new AppError(400, "欄位未填寫正確");

  const { rows } = await pool.query(
    `SELECT c.id, c.user_id, c.experience_years, c.description, c.profile_image_url,
            c.created_at, c.updated_at, u.name AS user_name, u.role AS user_role
       FROM coaches c
       JOIN users u ON u.id = c.user_id
      WHERE c.id = $1`,
    [coachId],
  );
  if (rows.length === 0) throw new AppError(400, "找不到該教練");
  return rows[0];
}

// 教練詳情
router.get(
  "/:coachId",
  asyncHandler(async (req, res) => {
    const coach = await findCoachOrThrow(req.params.coachId);

    const skills = await pool.query(
      `SELECT s.name
         FROM coach_skills cs
         JOIN skills s ON s.id = cs.skill_id
        WHERE cs.coach_id = $1
        ORDER BY s.name ASC`,
      [coach.id],
    );

    success(res, {
      user: { name: coach.user_name, role: coach.user_role },
      coach: {
        id: coach.id,
        user_id: coach.user_id,
        experience_years: coach.experience_years,
        description: coach.description,
        profile_image_url: coach.profile_image_url,
        created_at: coach.created_at,
        updated_at: coach.updated_at,
        skills: skills.rows.map((s) => s.name),
      },
    });
  }),
);

// 教練「未結束」的課程
router.get(
  "/:coachId/courses",
  asyncHandler(async (req, res) => {
    const coach = await findCoachOrThrow(req.params.coachId);

    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.start_at, c.end_at, c.max_participants,
              u.name AS coach_name, s.name AS skill_name
         FROM courses c
         JOIN users u ON u.id = c.user_id
         JOIN skills s ON s.id = c.skill_id
        WHERE c.user_id = $1 AND c.end_at > now()
        ORDER BY c.start_at ASC`,
      [coach.user_id],
    );
    success(res, rows);
  }),
);

module.exports = router;
