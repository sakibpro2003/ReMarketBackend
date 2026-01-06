require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDb = require("./config/db");
const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: CLIENT_ORIGIN.split(","),
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);

const start = async () => {
  try {
    await connectDb();
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is required");
    }
    app.listen(PORT, () => {
      console.log(`API listening on ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

start();
