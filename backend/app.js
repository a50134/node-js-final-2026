const express = require("express");
const cors = require("cors");
const { pool } = require("./config/db");
const { AppError } = require("./utils/http");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/healthcheck", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).type("text/plain").send("OK");
  } catch (err) {
    res.status(503).type("text/plain").send("DB NOT READY");
  }
});

app.use("/api/coaches", require("./routes/coaches"));
app.use("/api/credit-package", require("./routes/creditPackage"));
app.use("/api/users", require("./routes/users"));
app.use("/api/admin/coaches", require("./routes/adminCoaches"));
app.use("/api/courses", require("./routes/courses"));

// 找不到路由
app.use((req, res) => {
  res.status(404).json({ status: "failed", message: "無此路由" });
});

// 錯誤處理
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json({ status: "failed", message: err.message });
  }
  if (err.type === "entity.parse.failed" || err.status === 400) {
    return res
      .status(400)
      .json({ status: "failed", message: "欄位未填寫正確" });
  }
  console.error(err);
  res.status(500).json({ status: "error", message: "伺服器錯誤" });
});

module.exports = app;
