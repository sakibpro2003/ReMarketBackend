require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDb = require("./config/db");
const User = require("./models/User");
const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");
const productsRoutes = require("./routes/products");
const ordersRoutes = require("./routes/orders");
const uploadsRoutes = require("./routes/uploads");
const usersRoutes = require("./routes/users");
const wishlistRoutes = require("./routes/wishlist");

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

app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/wishlist", wishlistRoutes);

const start = async () => {
  try {
    await connectDb();
    try {
      await User.collection.dropIndex("firebaseUid_1");
    } catch (error) {
      if (!String(error?.message || "").includes("index not found")) {
        console.warn("Index cleanup skipped:", error.message);
      }
    }
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
