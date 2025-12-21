var Project = require("../models/project");

const mongoose = require("mongoose");

// Connect to shares DB to check permissions
const sharesConnection = mongoose.createConnection(process.env.SHARES_MONGO_URI || "mongodb://shares_mongoDB:27020/shares", { useNewUrlParser: true, useUnifiedTopology: true });

const ShareSchema = new mongoose.Schema({
  projectId: mongoose.Schema.Types.ObjectId,
  isActive: Boolean,
  accessedBy: [{
    userId: mongoose.Schema.Types.ObjectId
  }]
});
const Share = sharesConnection.model('Share', ShareSchema);

module.exports.getAll = async (user_id) => {
  return await Project.find({ user_id: user_id }).sort({ _id: 1 }).exec();
};

module.exports.getOne = async (user_id, project_id) => {
  // First try to find if user is owner
  let project = await Project.findOne({ user_id: user_id, _id: project_id }).exec();

  if (project) return project;

  // If not owner, check if user has shared access
  // 1. Check if project exists (to ensure we don't return null for non-existent projects just because of share check failure)
  // Actually we need the project returned effectively.

  // Let's find project by ID first (ignoring user)
  project = await Project.findOne({ _id: project_id }).exec();

  if (!project) return null; // Project doesn't exist

  // If project exists but user didn't match (already checked above, but safe to assume), check shares
  try {
    const hasAccess = await Share.findOne({
      projectId: new mongoose.Types.ObjectId(project_id),
      isActive: true,
      "accessedBy.userId": new mongoose.Types.ObjectId(user_id)
    });

    if (hasAccess) {
      return project;
    }
  } catch (err) {
    console.error("Error checking share access:", err);
  }

  return null;
};

module.exports.create = async (project) => {
  return await Project.create(project);
};

module.exports.update = (user_id, project_id, project) => {
  return Project.updateOne({ user_id: user_id, _id: project_id }, project);
};

module.exports.delete = (user_id, project_id) => {
  return Project.deleteOne({ user_id: user_id, _id: project_id });
};
