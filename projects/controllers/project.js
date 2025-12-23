var Project = require("../models/project");
const mongoose = require("mongoose");

module.exports.getAll = async (user_id) => {
  return await Project.find({ user_id: user_id }).sort({ _id: 1 }).exec();
};

// Internal method: Get project by ID only (for inter-service communication)
module.exports.getById = async (project_id) => {
  return await Project.findOne({ _id: project_id }).exec();
};

/**
 * Get a project - checks ownership and permissions
 * @param {string} user_id - The user trying to access the project
 * @param {string} project_id - The project ID
 * @returns {object|null} Project with access info, or null if no access
 */
module.exports.getOne = async (user_id, project_id) => {
  // First try to find if user is owner
  let project = await Project.findOne({ user_id: user_id, _id: project_id }).exec();

  if (project) {
    // Owner has full access
    project = project.toObject();
    project._accessRole = "owner";
    return project;
  }

  // If not owner, check project permissions
  project = await Project.findOne({ _id: project_id }).exec();

  if (!project) return null; // Project doesn't exist

  const userIdObj = new mongoose.Types.ObjectId(user_id);

  // Check if user is in editors
  if (project.permissions?.editors?.some(id => id.equals(userIdObj))) {
    project = project.toObject();
    project._accessRole = "editor";
    return project;
  }

  // Check if user is in viewers
  if (project.permissions?.viewers?.some(id => id.equals(userIdObj))) {
    project = project.toObject();
    project._accessRole = "viewer";
    return project;
  }

  return null; // No access
};

/**
 * Add a user to project permissions
 * @param {string} project_id - Project ID
 * @param {string} user_id - User to add
 * @param {string} role - "editor" or "viewer"
 * @returns {object} Updated project
 */
module.exports.addPermission = async (project_id, user_id, role) => {
  const userIdObj = new mongoose.Types.ObjectId(user_id);
  const projectIdObj = new mongoose.Types.ObjectId(project_id);

  const updateField = role === "edit" ? "permissions.editors" : "permissions.viewers";

  // Remove from both arrays first (to avoid duplicates), then add to correct one
  await Project.updateOne(
    { _id: projectIdObj },
    {
      $pull: {
        "permissions.editors": userIdObj,
        "permissions.viewers": userIdObj
      }
    }
  );

  // Add to the correct array
  const result = await Project.findOneAndUpdate(
    { _id: projectIdObj },
    { $addToSet: { [updateField]: userIdObj } },
    { new: true }
  );

  return result;
};

/**
 * Remove a user from project permissions
 * @param {string} project_id - Project ID
 * @param {string} user_id - User to remove
 * @returns {object} Updated project
 */
module.exports.removePermission = async (project_id, user_id) => {
  const userIdObj = new mongoose.Types.ObjectId(user_id);
  const projectIdObj = new mongoose.Types.ObjectId(project_id);

  const result = await Project.findOneAndUpdate(
    { _id: projectIdObj },
    {
      $pull: {
        "permissions.editors": userIdObj,
        "permissions.viewers": userIdObj
      }
    },
    { new: true }
  );

  return result;
};

/**
 * Check if user has permission to a project
 * @param {string} project_id - Project ID
 * @param {string} user_id - User ID
 * @returns {object} { hasAccess: boolean, role: string|null }
 */
module.exports.checkPermission = async (project_id, user_id) => {
  const project = await Project.findOne({ _id: project_id }).exec();

  if (!project) return { hasAccess: false, role: null };

  // Check if owner
  if (project.user_id.toString() === user_id) {
    return { hasAccess: true, role: "owner" };
  }

  const userIdObj = new mongoose.Types.ObjectId(user_id);

  // Check if editor
  if (project.permissions?.editors?.some(id => id.equals(userIdObj))) {
    return { hasAccess: true, role: "editor" };
  }

  // Check if viewer
  if (project.permissions?.viewers?.some(id => id.equals(userIdObj))) {
    return { hasAccess: true, role: "viewer" };
  }

  return { hasAccess: false, role: null };
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
