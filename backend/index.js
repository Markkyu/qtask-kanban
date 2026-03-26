const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// import routes
const registerRouter = require("./routes/register");
const loginRouter = require("./routes/login");

// use routes
app.use("/api/register", registerRouter);
app.use("/api/login", loginRouter);

// routes
app.get("/", (req, res) => {
  res.send("Welcome to QTask API");
});

// listen
app.listen(5000, () => {
  console.log("Server is running on port 5000");
});
