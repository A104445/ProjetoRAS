const Preset = require("../models/preset");

module.exports.create = async (preset) => {
    return await Preset.create(preset);
};

module.exports.getAll = async (user_id) => {
    return await Preset.find({ user_id: user_id }).sort({ created_at: -1 }).exec();
};

module.exports.getOne = async (user_id, preset_id) => {
    return await Preset.findOne({ user_id: user_id, _id: preset_id }).exec();
};

module.exports.update = async (user_id, preset_id, data) => {
    return await Preset.updateOne({ user_id: user_id, _id: preset_id }, data);
};

module.exports.delete = async (user_id, preset_id) => {
    return await Preset.deleteOne({ user_id: user_id, _id: preset_id });
};
