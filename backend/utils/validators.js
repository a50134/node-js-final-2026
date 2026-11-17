const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASSWORD_RE = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[a-zA-Z\d]{8,16}$/;

const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isNonNegativeInt = (v) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;
const isHttps = (v) => typeof v === "string" && v.startsWith("https");
const isValidPassword = (v) => typeof v === "string" && PASSWORD_RE.test(v);
const isValidDate = (v) =>
  typeof v === "string" && !Number.isNaN(new Date(v).getTime());

module.exports = {
  isUuid,
  isNonEmptyString,
  isNonNegativeInt,
  isHttps,
  isValidPassword,
  isValidDate,
};
