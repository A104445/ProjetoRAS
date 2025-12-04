var express = require("express");
var router = express.Router();
const Preset = require("../controllers/preset");

// Get all presets for a user
router.get("/:user", (req, res, next) => {
    Preset.getAll(req.params.user)
        .then((presets) => res.status(200).jsonp(presets))
        .catch((_) => res.status(500).jsonp("Error acquiring user's presets"));
});

// Create a new preset
router.post("/:user", async (req, res, next) => {
    console.log("Hit create preset route for user:", req.params.user);
    try {
        const userPresets = await Preset.getAll(req.params.user);
        if (userPresets.length >= 4) {
            return res.status(403).jsonp("Preset limit reached (max 4)");
        }

        const preset = {
            user_id: req.params.user,
            name: req.body.name,
            tools: req.body.tools,
        };

        if (!preset.name || !preset.tools) {
            return res.status(400).jsonp("Name and tools are required");
        }

        Preset.create(preset)
            .then((createdPreset) => res.status(201).jsonp(createdPreset))
            .catch((_) => res.status(502).jsonp("Error creating new preset"));
    } catch (error) {
        res.status(500).jsonp("Error checking preset limit");
    }
});

// Update a preset
router.put("/:user/:preset", (req, res, next) => {
    const data = req.body;
    Preset.update(req.params.user, req.params.preset, data)
        .then((_) => res.sendStatus(204))
        .catch((_) => res.status(503).jsonp("Error updating preset"));
});

// Delete a preset
router.delete("/:user/:preset", (req, res, next) => {
    Preset.delete(req.params.user, req.params.preset)
        .then((_) => res.sendStatus(204))
        .catch((_) => res.status(503).jsonp("Error deleting preset"));
});

module.exports = router;
