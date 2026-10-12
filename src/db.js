const mysql = require("mysql2/promise");

const config = () => ({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  dateStrings: true,
});

// Short-lived connection per call, always closed in finally (hosting recommendation).
async function withConnection(fn, extra = {}) {
  const conn = await mysql.createConnection({ ...config(), ...extra });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

const query = (sql, params = []) => withConnection(async (c) => (await c.execute(sql, params))[0]);

// JSON stored as text so it works on both MySQL and MariaDB.
const parseJson = (v) => (typeof v === "string" ? JSON.parse(v) : v);

module.exports = { withConnection, query, parseJson };
