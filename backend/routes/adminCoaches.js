const express = require("express");
const { pool, withTransaction } = require("../config/db");
const { isAuth, isCoach } = require("../middleware/auth");
const { AppError, success, asyncHandler } = require("../utils/http");
const {
  isUuid,
  isNonEmptyString,
  isNonNegativeInt,
  isHttps,
  isValidDate,
} = require("../utils/validators");

const router = express.Router();

const BAD_FIELDS = "欄位未填寫正確";

// 檢查課程欄位
function parseCourseBody(body = {}) {
  const {
    skill_id: skillId,
    name,
    description,
    start_at: startAt,
    end_at: endAt,
    max_participants: max,
    meeting_url: url,
  } = body;

  if (
    !isUuid(skillId) ||
    !isNonEmptyString(name) ||
    !isNonEmptyString(description) ||
    !isValidDate(startAt) ||
    !isValidDate(endAt) ||
    !isNonNegativeInt(max) ||
    !isNonEmptyString(url) ||
    !isHttps(url)
  ) {
    throw new AppError(400, BAD_FIELDS);
  }
  return {
    skillId,
    name: name.trim(),
    description,
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    max,
    url,
  };
}

async function assertSkillExists(skillId) {
  const { rowCount } = await pool.query("SELECT 1 FROM skills WHERE id = $1", [
    skillId,
  ]);
  if (rowCount === 0) throw new AppError(400, BAD_FIELDS);
}

const courseObject = (r) => ({
  id: r.id,
  user_id: r.user_id,
  skill_id: r.skill_id,
  name: r.name,
  description: r.description,
  start_at: r.start_at,
  end_at: r.end_at,
  max_participants: r.max_participants,
  meeting_url: r.meeting_url,
  created_at: r.created_at,
  updated_at: r.updated_at,
});

// ===== 課程管理=====

// 開的課程列表
router.get(
  "/courses",
  isAuth,
  isCoach,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.start_at, c.end_at, c.max_participants, c.meeting_url,
                           (SELECT COUNT(*)::int FROM course_bookings b
                WHERE b.course_id = c.id AND b.cancelled_at IS NULL) AS participants
         FROM courses c
        WHERE c.user_id = $1
        ORDER BY c.start_at ASC`,
      [req.user.id],
    );
    const now = Date.now();
    const data = rows.map((r) => {
      let status = "進行中";
      if (now < r.start_at.getTime()) status = "尚未開始";
      else if (now >= r.end_at.getTime()) status = "已結束";
      return {
        id: r.id,
        name: r.name,
        status,
        start_at: r.start_at,
        end_at: r.end_at,
        max_participants: r.max_participants,
        meeting_url: r.meeting_url,
        participants: Number(r.participants),
      };
    });
    success(res, data);
  }),
);

// 開新課程
router.post(
  "/courses",
  isAuth,
  isCoach,
  asyncHandler(async (req, res) => {
    const c = parseCourseBody(req.body);
    await assertSkillExists(c.skillId);

    const { rows } = await pool.query(
      `INSERT INTO courses
         (user_id, skill_id, name, description, start_at, end_at, max_participants, meeting_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.id,
        c.skillId,
        c.name,
        c.description,
        c.startAt,
        c.endAt,
        c.max,
        c.url,
      ],
    );
    success(res, { course: courseObject(rows[0]) }, 201);
  }),
);

// 課程詳情（只能看自己的）
router.get(
  "/courses/:courseId",
  isAuth,
  asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    if (!isUuid(courseId)) throw new AppError(400, "課程不存在");

    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.start_at, c.end_at, c.max_participants,
              s.name AS skill_name, c.skill_id, c.meeting_url
         FROM courses c
         JOIN skills s ON s.id = c.skill_id
        WHERE c.id = $1 AND c.user_id = $2`,
      [courseId, req.user.id],
    );
    if (rows.length === 0) throw new AppError(400, "課程不存在");
    success(res, rows[0]);
  }),
);

// 更新課程（只能改自己的）
router.put(
  "/courses/:courseId",
  isAuth,
  asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const c = parseCourseBody(req.body);
    if (!isUuid(courseId)) throw new AppError(400, "課程不存在");
    await assertSkillExists(c.skillId);

    const { rows } = await pool.query(
      `UPDATE courses
          SET skill_id = $1, name = $2, description = $3, start_at = $4, end_at = $5,
              max_participants = $6, meeting_url = $7, updated_at = now()
        WHERE id = $8 AND user_id = $9
        RETURNING *`,
      [
        c.skillId,
        c.name,
        c.description,
        c.startAt,
        c.endAt,
        c.max,
        c.url,
        courseId,
        req.user.id,
      ],
    );
    if (rows.length === 0) throw new AppError(400, "課程不存在");
    success(res, { course: courseObject(rows[0]) });
  }),
);

// ===== M6 月營收 =====

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

router.get(
  "/revenue",
  isAuth,
  isCoach,
  asyncHandler(async (req, res) => {
    const monthIndex = MONTHS.indexOf(req.query.month);
    if (typeof req.query.month !== "string" || monthIndex === -1) {
      throw new AppError(400, BAD_FIELDS);
    }

    // 年份固定為伺服器的當年；以「報名建立時間」決定算進哪個月
    const year = new Date().getFullYear();
    const from = new Date(year, monthIndex, 1);
    const to = new Date(year, monthIndex + 1, 1);

    const bookings = await pool.query(
      `SELECT COUNT(*)::int AS booking_count,
              COUNT(DISTINCT b.user_id)::int AS participants
         FROM course_bookings b
         JOIN courses c ON c.id = b.course_id
        WHERE c.user_id = $1
          AND b.cancelled_at IS NULL
          AND b.created_at >= $2 AND b.created_at < $3`,
      [req.user.id, from, to],
    );

    const packages = await pool.query(
      `SELECT COALESCE(SUM(price), 0)::float8 AS total_price,
              COALESCE(SUM(credit_amount), 0)::float8 AS total_credits
         FROM credit_packages`,
    );

    const { booking_count: bookingCount, participants } = bookings.rows[0];
    const { total_price: totalPrice, total_credits: totalCredits } =
      packages.rows[0];

    // 單堂均價 = 全部方案總價 ÷ 全部方案總堂數；先乘再 floor
    const perCredit = totalCredits > 0 ? totalPrice / totalCredits : 0;
    const revenue = Math.floor(bookingCount * perCredit);

    success(res, {
      total: { revenue, participants, course_count: bookingCount },
    });
  }),
);

// ==== 教練本人資料 ===

async function loadCoachProfile(userId) {
  const { rows } = await pool.query(
    `SELECT id, experience_years, description, profile_image_url
       FROM coaches WHERE user_id = $1`,
    [userId],
  );
  if (rows.length === 0) throw new AppError(401, "使用者尚未成為教練");

  const skills = await pool.query(
    "SELECT skill_id FROM coach_skills WHERE coach_id = $1 ORDER BY skill_id",
    [rows[0].id],
  );
  return { ...rows[0], skill_ids: skills.rows.map((s) => s.skill_id) };
}

router.get(
  "/",
  isAuth,
  isCoach,
  asyncHandler(async (req, res) => {
    success(res, await loadCoachProfile(req.user.id));
  }),
);

router.put(
  "/",
  isAuth,
  isCoach,
  asyncHandler(async (req, res) => {
    const {
      experience_years: years,
      description,
      profile_image_url: imageUrl,
      skill_ids: skillIds,
    } = req.body || {};

    if (
      !isNonNegativeInt(years) ||
      !isNonEmptyString(description) ||
      !isNonEmptyString(imageUrl) ||
      !isHttps(imageUrl) ||
      !Array.isArray(skillIds) ||
      skillIds.length === 0 ||
      !skillIds.every(isUuid)
    ) {
      throw new AppError(400, BAD_FIELDS);
    }

    const uniqueSkillIds = [...new Set(skillIds)];
    const found = await pool.query(
      "SELECT id FROM skills WHERE id = ANY($1::uuid[])",
      [uniqueSkillIds],
    );
    if (found.rowCount !== uniqueSkillIds.length) {
      throw new AppError(400, BAD_FIELDS);
    }

    await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE coaches
            SET experience_years = $1, description = $2, profile_image_url = $3, updated_at = now()
          WHERE user_id = $4
          RETURNING id`,
        [years, description, imageUrl, req.user.id],
      );
      if (updated.rowCount === 0) {
        throw new AppError(401, "使用者尚未成為教練");
      }
      const coachId = updated.rows[0].id;

      // 技能整批覆蓋
      await client.query("DELETE FROM coach_skills WHERE coach_id = $1", [
        coachId,
      ]);
      await client.query(
        `INSERT INTO coach_skills (coach_id, skill_id)
         SELECT $1, UNNEST($2::uuid[])`,
        [coachId, uniqueSkillIds],
      );
    });

    success(res, await loadCoachProfile(req.user.id));
  }),
);

// ===== 升級為教練（public /courses）=====

router.post(
  "/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const {
      experience_years: years,
      description,
      profile_image_url: imageUrl,
    } = req.body || {};

    const hasImage =
      imageUrl !== undefined && imageUrl !== null && imageUrl !== "";
    if (
      !isNonNegativeInt(years) ||
      !isNonEmptyString(description) ||
      (hasImage && !isHttps(imageUrl))
    ) {
      throw new AppError(400, BAD_FIELDS);
    }
    if (!isUuid(userId)) throw new AppError(400, "使用者不存在");

    const result = await withTransaction(async (client) => {
      const user = await client.query(
        "SELECT id, name, role FROM users WHERE id = $1 FOR UPDATE",
        [userId],
      );
      if (user.rowCount === 0) throw new AppError(400, "使用者不存在");

      const existing = await client.query(
        "SELECT 1 FROM coaches WHERE user_id = $1",
        [userId],
      );
      if (existing.rowCount > 0 || user.rows[0].role === "COACH") {
        throw new AppError(409, "使用者已經是教練");
      }

      const coach = await client.query(
        `INSERT INTO coaches (user_id, experience_years, description, profile_image_url)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, experience_years, description, profile_image_url, created_at, updated_at`,
        [userId, years, description, hasImage ? imageUrl : null],
      );
      await client.query(
        "UPDATE users SET role = 'COACH', updated_at = now() WHERE id = $1",
        [userId],
      );
      return {
        user: { name: user.rows[0].name, role: "COACH" },
        coach: coach.rows[0],
      };
    });

    success(res, result, 201);
  }),
);

module.exports = router;
