const mongoose = require("mongoose");

const toolSchema = new mongoose.Schema({
  position: { type: Number, required: true },
  procedure: { type: String, required: true },
  params: { type: mongoose.Schema.Types.Mixed, required: true }, // This field can be any type of object
});

const imgSchema = new mongoose.Schema({
  og_uri: { type: String, required: true },
  new_uri: { type: String, required: true },
  og_img_key: { type: String, required: true },
});

// Permissions structure: { editors: [userIds], viewers: [userIds] }
const permissionsSchema = new mongoose.Schema({
  editors: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  viewers: { type: [mongoose.Schema.Types.ObjectId], default: [] },
}, { _id: false });

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true }, // Owner
  imgs: { type: [imgSchema], default: [] },
  tools: { type: [toolSchema], default: [] },
  permissions: { type: permissionsSchema, default: { editors: [], viewers: [] } },
});

module.exports = mongoose.model("project", projectSchema);

