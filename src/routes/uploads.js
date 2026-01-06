const express = require("express");
const multer = require("multer");
const requireAuth = require("../middleware/requireAuth");
const { cloudinary, configureCloudinary } = require("../lib/cloudinary");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post("/image", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Image file is required" });
    }

    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image uploads are allowed" });
    }

    configureCloudinary();
    const folder = process.env.CLOUDINARY_FOLDER || "remarket/listings";
    const base64 = req.file.buffer.toString("base64");
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image"
    });

    return res.json({
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    console.error("Cloudinary upload failed", error);
    return res.status(500).json({ error: "Failed to upload image" });
  }
});

module.exports = router;
