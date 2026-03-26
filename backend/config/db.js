const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "qtask_db",
  waitForConnections: true,
  connectionLimit: 10, // allows concurrency
  queueLimit: 0,
});

// Test the connection
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("Database Connected");
    connection.release();
  } catch (err) {
    console.error("Database Connection Failed:", err.message);
  }
})();

module.exports = pool;
