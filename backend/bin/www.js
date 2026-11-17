require("dotenv").config();

const app = require("../app");
const { initDatabase } = require("../db/init");

const PORT = Number(process.env.PORT) || 8080;

(async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  } catch (err) {
    console.error("啟動失敗：", err);
    process.exit(1);
  }
})();
