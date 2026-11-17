const { pool } = require("../config/db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(50) NOT NULL,
  email varchar(320) NOT NULL UNIQUE,
  password text NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'USER',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL UNIQUE,
  credit_amount integer NOT NULL,
  price integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  experience_years integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  profile_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coach_skills (
  coach_id uuid NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_id, skill_id)
);

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id),
  name varchar(200) NOT NULL,
  description text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  max_participants integer NOT NULL,
  meeting_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_package_id uuid REFERENCES credit_packages(id) ON DELETE SET NULL,
  name varchar(100) NOT NULL,
  purchased_credits integer NOT NULL,
  price_paid integer NOT NULL,
  purchase_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  UNIQUE (user_id, course_id)
);
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function initDatabase({ retries = 30, delayMs = 2000 } = {}) {
  let lastError;
  for (let i = 1; i <= retries; i += 1) {
    try {
      await pool.query("SELECT 1");
      await pool.query(SCHEMA); // 建表
      return;
    } catch (err) {
      lastError = err;
      console.log(`等待資料庫就緒 (${i}/${retries})：${err.message}`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

module.exports = { initDatabase };
