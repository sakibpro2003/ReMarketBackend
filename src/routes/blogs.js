const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const requireAuth = require("../middleware/requireAuth");
const requireActiveUser = require("../middleware/requireActiveUser");
const Blog = require("../models/Blog");
const BlogComment = require("../models/BlogComment");
const BlogFeedback = require("../models/BlogFeedback");
const Notification = require("../models/Notification");

const router = express.Router();

const blogCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    description: z.string().trim().min(1, "Description is required"),
    tags: z.array(z.string().trim()).optional(),
    images: z
      .array(
        z.object({
          url: z.string().trim().url("Image URL must be valid")
        })
      )
      .optional(),
    status: z.enum(["draft", "pending"]).optional()
  })
  .strict();

const commentSchema = z
  .object({
    comment: z.string().trim().min(1).max(1000)
  })
  .strict();

const feedbackSchema = z
  .object({
    helpful: z.boolean()
  })
  .strict();

const firstZodError = (error) => error.errors?.[0]?.message || "Invalid data";

const ensureValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const getFeedbackSummary = async (blogId) => {
  const summary = await BlogFeedback.aggregate([
    { $match: { blog: new mongoose.Types.ObjectId(blogId) } },
    {
      $group: {
        _id: "$helpful",
        count: { $sum: 1 }
      }
    }
  ]);

  let helpfulCount = 0;
  let notHelpfulCount = 0;
  summary.forEach((entry) => {
    if (entry._id === true) {
      helpfulCount = entry.count;
    } else {
      notHelpfulCount = entry.count;
    }
  });

  return { helpfulCount, notHelpfulCount };
};

router.post("/", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const parsed = blogCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const payload = parsed.data;
    const blog = await Blog.create({
      author: req.userId,
      title: payload.title,
      description: payload.description,
      tags: payload.tags || [],
      images: payload.images || [],
      status: payload.status || "pending"
    });

    if (blog.status === "pending") {
      await Notification.create({
        type: "blog_submitted",
        message: `New blog submitted: ${blog.title}`,
        blog: blog._id,
        seller: req.userId
      });
    }

    return res.status(201).json({ blog });
  } catch (error) {
    console.error("Create blog failed", error);
    return res.status(500).json({ error: "Failed to create blog" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const filter = { status: "approved" };
    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(Number.parseInt(limit, 10) || 6, 1),
      50
    );

    if (search && search.trim().length) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      filter.$or = [{ title: regex }, { description: regex }, { tags: regex }];
    }

    const total = await Blog.countDocuments(filter);
    const blogs = await Blog.find(filter)
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .populate("author", "firstName lastName avatarUrl")
      .lean();

    const blogIds = blogs.map((blog) => blog._id);
    let commentMap = new Map();
    if (blogIds.length) {
      const commentCounts = await BlogComment.aggregate([
        { $match: { blog: { $in: blogIds } } },
        { $group: { _id: "$blog", count: { $sum: 1 } } }
      ]);
      commentMap = new Map(
        commentCounts.map((item) => [item._id.toString(), item.count])
      );
    }

    let feedbackMap = new Map();
    if (blogIds.length) {
      const feedbackCounts = await BlogFeedback.aggregate([
        { $match: { blog: { $in: blogIds } } },
        {
          $group: {
            _id: { blog: "$blog", helpful: "$helpful" },
            count: { $sum: 1 }
          }
        }
      ]);

      feedbackCounts.forEach((entry) => {
        const key = entry._id.blog.toString();
        const current = feedbackMap.get(key) || {
          helpfulCount: 0,
          notHelpfulCount: 0
        };
        if (entry._id.helpful === true) {
          current.helpfulCount = entry.count;
        } else {
          current.notHelpfulCount = entry.count;
        }
        feedbackMap.set(key, current);
      });
    }

    return res.json({
      blogs: blogs.map((blog) => {
        const authorName = blog.author
          ? `${blog.author.firstName} ${blog.author.lastName}`.trim()
          : "Unknown";
        const counts = feedbackMap.get(blog._id.toString()) || {
          helpfulCount: 0,
          notHelpfulCount: 0
        };

        return {
          id: blog._id.toString(),
          title: blog.title,
          description: blog.description,
          tags: blog.tags || [],
          images: blog.images || [],
          createdAt: blog.createdAt,
          author: blog.author
            ? {
                id: blog.author._id.toString(),
                name: authorName,
                avatarUrl: blog.author.avatarUrl || ""
              }
            : null,
          commentCount: commentMap.get(blog._id.toString()) || 0,
          helpfulCount: counts.helpfulCount || 0,
          notHelpfulCount: counts.notHelpfulCount || 0
        };
      }),
      total,
      page: currentPage,
      pageSize
    });
  } catch (error) {
    console.error("Load blogs failed", error);
    return res.status(500).json({ error: "Failed to load blogs" });
  }
});

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const blogs = await Blog.find({ author: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ blogs });
  } catch (error) {
    console.error("Load user blogs failed", error);
    return res.status(500).json({ error: "Failed to load blogs" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ensureValidId(id)) {
      return res.status(400).json({ error: "Invalid blog id" });
    }

    const blog = await Blog.findOne({ _id: id, status: "approved" })
      .populate("author", "firstName lastName avatarUrl")
      .lean();
    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    const commentCount = await BlogComment.countDocuments({ blog: id });
    const feedbackSummary = await getFeedbackSummary(id);
    const authorName = blog.author
      ? `${blog.author.firstName} ${blog.author.lastName}`.trim()
      : "Unknown";

    return res.json({
      blog: {
        id: blog._id.toString(),
        title: blog.title,
        description: blog.description,
        tags: blog.tags || [],
        images: blog.images || [],
        createdAt: blog.createdAt,
        author: blog.author
          ? {
              id: blog.author._id.toString(),
              name: authorName,
              avatarUrl: blog.author.avatarUrl || ""
            }
          : null,
        commentCount,
        helpfulCount: feedbackSummary.helpfulCount,
        notHelpfulCount: feedbackSummary.notHelpfulCount
      }
    });
  } catch (error) {
    console.error("Load blog failed", error);
    return res.status(500).json({ error: "Failed to load blog" });
  }
});

router.get("/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ensureValidId(id)) {
      return res.status(400).json({ error: "Invalid blog id" });
    }

    const blog = await Blog.findOne({ _id: id, status: "approved" }).select(
      "_id"
    );
    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    const comments = await BlogComment.find({ blog: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("user", "firstName lastName avatarUrl")
      .lean();

    return res.json({
      comments: comments.map((comment) => ({
        id: comment._id.toString(),
        comment: comment.comment,
        createdAt: comment.createdAt,
        user: comment.user
          ? {
              id: comment.user._id.toString(),
              name: `${comment.user.firstName} ${comment.user.lastName}`.trim(),
              avatarUrl: comment.user.avatarUrl || ""
            }
          : null
      }))
    });
  } catch (error) {
    console.error("Load blog comments failed", error);
    return res.status(500).json({ error: "Failed to load comments" });
  }
});

router.post("/:id/comments", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ensureValidId(id)) {
      return res.status(400).json({ error: "Invalid blog id" });
    }

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const blog = await Blog.findOne({ _id: id, status: "approved" }).select(
      "_id"
    );
    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    const created = await BlogComment.create({
      blog: id,
      user: req.userId,
      comment: parsed.data.comment
    });
    const populated = await created.populate("user", "firstName lastName avatarUrl");

    return res.status(201).json({
      comment: {
        id: created._id.toString(),
        comment: created.comment,
        createdAt: created.createdAt,
        user: populated.user
          ? {
              id: populated.user._id.toString(),
              name: `${populated.user.firstName} ${populated.user.lastName}`.trim(),
              avatarUrl: populated.user.avatarUrl || ""
            }
          : null
      }
    });
  } catch (error) {
    console.error("Create blog comment failed", error);
    return res.status(500).json({ error: "Failed to add comment" });
  }
});

router.get("/:id/feedback/me", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ensureValidId(id)) {
      return res.status(400).json({ error: "Invalid blog id" });
    }

    const feedback = await BlogFeedback.findOne({
      blog: id,
      user: req.userId
    }).select("helpful");

    return res.json({ feedback: feedback ? { helpful: feedback.helpful } : null });
  } catch (error) {
    console.error("Load blog feedback failed", error);
    return res.status(500).json({ error: "Failed to load feedback" });
  }
});

router.post("/:id/feedback", requireAuth, requireActiveUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ensureValidId(id)) {
      return res.status(400).json({ error: "Invalid blog id" });
    }

    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: firstZodError(parsed.error) });
    }

    const blog = await Blog.findOne({ _id: id, status: "approved" }).select(
      "_id"
    );
    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    const feedback = await BlogFeedback.findOneAndUpdate(
      { blog: id, user: req.userId },
      { $set: { helpful: parsed.data.helpful } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const summary = await getFeedbackSummary(id);

    return res.json({
      feedback: { helpful: feedback.helpful },
      helpfulCount: summary.helpfulCount,
      notHelpfulCount: summary.notHelpfulCount
    });
  } catch (error) {
    console.error("Submit blog feedback failed", error);
    return res.status(500).json({ error: "Failed to submit feedback" });
  }
});

module.exports = router;
