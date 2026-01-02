var express = require("express");
var router = express.Router();

const axios = require("axios");

const https = require("https");
const fs = require("fs");

const multer = require("multer");
const FormData = require("form-data");

const auth = require("../auth/auth");

const key = fs.readFileSync(__dirname + "/../certs/selfsigned.key");
const cert = fs.readFileSync(__dirname + "/../certs/selfsigned.crt");

const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // (NOTE: this will disable client verification)
  cert: cert,
  key: key,
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const projectsURL = "https://projects:9001/";
const SHARES_SERVICE = process.env.SHARES_SERVICE_URL || "https://shares:9003";

// --- Shared Project Route (for collaborators) ---

/**
 * Get a shared project (for viewers/editors who are not owners)
 * Uses the project owner's ID for MinIO calls internally
 */
router.get("/shared/:projectId", auth.checkAuth, function (req, res, next) {
  axios
    .get(projectsURL + `shared/${req.params.projectId}`, {
      params: { userId: req.userId },
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => {
      console.error("Error fetching shared project:", err.response?.data || err.message);
      const status = err.response?.status || 500;
      const message = err.response?.data?.error || "Error fetching shared project";
      res.status(status).jsonp({ error: message });
    });
});

/**
 * Get shared project results (for viewers/editors)
 */
router.get("/shared/:projectId/results", auth.checkAuth, function (req, res, next) {
  axios
    .get(projectsURL + `shared/${req.params.projectId}/results`, {
      params: { userId: req.userId },
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => {
      console.error("Error fetching shared project results:", err.response?.data || err.message);
      const status = err.response?.status || 500;
      const message = err.response?.data?.error || "Error fetching shared project results";
      res.status(status).jsonp({ error: message });
    });
});

// ==================== SHARED EDITOR ROUTES ====================

/**
 * Add tool to shared project (editors only)
 */
router.post("/shared/:projectId/tool", auth.checkAuth, function (req, res, next) {
  axios
    .post(projectsURL + `shared/${req.params.projectId}/tool`, req.body, {
      params: { userId: req.userId },
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => {
      const status = err.response?.status || 500;
      const message = err.response?.data?.error || "Error adding tool";
      res.status(status).jsonp({ error: message });
    });
});

/**
 * Update tool on shared project (editors only)
 */
router.put("/shared/:projectId/tool/:toolId", auth.checkAuth, function (req, res, next) {
  axios
    .put(projectsURL + `shared/${req.params.projectId}/tool/${req.params.toolId}`, req.body, {
      params: { userId: req.userId },
      httpsAgent: httpsAgent,
    })
    .then(() => res.sendStatus(204))
    .catch((err) => {
      const status = err.response?.status || 500;
      const message = err.response?.data?.error || "Error updating tool";
      res.status(status).jsonp({ error: message });
    });
});

/**
 * Delete tool from shared project (editors only)
 */
router.delete("/shared/:projectId/tool/:toolId", auth.checkAuth, function (req, res, next) {
  axios
    .delete(projectsURL + `shared/${req.params.projectId}/tool/${req.params.toolId}`, {
      params: { userId: req.userId },
      httpsAgent: httpsAgent,
    })
    .then(() => res.sendStatus(204))
    .catch((err) => {
      const status = err.response?.status || 500;
      const message = err.response?.data?.error || "Error deleting tool";
      res.status(status).jsonp({ error: message });
    });
});

/**
 * Clear all tools from shared project (editors only)
 */
router.delete("/shared/:projectId/tools", auth.checkAuth, function (req, res, next) {
  axios
    .delete(projectsURL + `shared/${req.params.projectId}/tools`, {
      params: { userId: req.userId },
      httpsAgent: httpsAgent,
    })
    .then(() => res.sendStatus(204))
    .catch((err) => {
      const status = err.response?.status || 500;
      const message = err.response?.data?.error || "Error clearing tools";
      res.status(status).jsonp({ error: message });
    });
});

/**
 * Process a shared project (editors only)
 */
router.post("/shared/:projectId/process", auth.checkAuth, function (req, res, next) {
  axios
    .post(projectsURL + `shared/${req.params.projectId}/process`, req.body, {
      params: { userId: req.userId },
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => {
      console.error("Error processing shared project:", err.response?.data || err.message);
      const status = err.response?.status || 500;
      const message = err.response?.data?.error || "Error processing project";
      res.status(status).jsonp({ error: message });
    });
});

// --- Share Routes (Nested under /projects) ---

/**
 * Create share (POST /projects/:projectId/shares)
 */
router.post("/:projectId/shares", function (req, res, next) {
  // Inject projectId from param into body if needed, or just forward
  const payload = { ...req.body, projectId: req.params.projectId };
  console.log("Creating share via projects route:", payload);
  axios
    .post(SHARES_SERVICE + "/shares", payload, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => {
      console.error("DEBUG: Error creating share via projects route.");
      console.error("DEBUG: Error message:", err.message);
      if (err.response) {
        console.error("DEBUG: Response status:", err.response.status);
        console.error("DEBUG: Response data:", JSON.stringify(err.response.data));
      } else if (err.request) {
        console.error("DEBUG: No response received. Request info:", err.request);
      } else {
        console.error("DEBUG: Error config:", err.config);
      }

      const status = err.response?.status || 500;
      const message = err.response?.data?.error || "Error creating share";
      res.status(status).jsonp({ error: message });
    });
});

/**
 * List project shares (GET /projects/:projectId/shares)
 */
router.get("/:projectId/shares", function (req, res, next) {
  axios
    .get(SHARES_SERVICE + `/shares/project/${req.params.projectId}`, {
      params: req.query, // Forward query params like userId
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => {
      console.error("Error getting shares:", err.message);
      res.status(500).jsonp("Error getting project shares");
    });
});

/**
 * Revoke share (DELETE /projects/:projectId/shares/:shareId)
 */
router.delete("/:projectId/shares/:shareId", function (req, res, next) {
  axios
    .delete(SHARES_SERVICE + `/shares/${req.params.shareId}`, {
      data: req.body, // Forward body containing userId
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => {
      console.error("Error revoking share:", err.message);
      res.status(500).jsonp("Error revoking share");
    });
});

// ---------------------------------------------


// TODO Verify jwt

/*
Project structure
{
    "_id": Mongoose.type.id,
    "user_id": Mongoose.type.id,
    "name": String,
    "imgs": [Image Structure],
    "tools": [Tool Structure],
}

Image structure
{
    "_id": Mongoose.type.id,
    "og_uri": String,
    "new_uri": String
}

Tool structure
{
    "_id": Mongoose.type._id,
    "position": Number,
    "procedure": String,
    "params": Object
}

Post answer structure in case of success
{
    "acknowledged": Bool,
    "modifiedCount": Number,
    "upsertedId": null,
    "upsertedCount": Number,
    "matchedCount": Number
}
*/

/**
 * Note: auth.checkToken is a midleware used to verify JWT
 */

/**
 * Get user's projects
 * @body Empty
 * @returns List of projects, each project has no information about it's images or tools
 */
/**
 * Get user's presets
 * @body Empty
 * @returns List of presets
 */
router.get("/presets/:user", auth.checkToken, function (req, res, next) {
  axios
    .get(projectsURL + `presets/${req.params.user}`, { httpsAgent: httpsAgent })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error getting presets"));
});

/**
 * Create new preset
 * @body { "name": String, "tools": Array }
 * @returns Created preset
 */
router.post("/presets/:user", auth.checkToken, function (req, res, next) {
  axios
    .post(projectsURL + `presets/${req.params.user}`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error creating preset"));
});

/**
 * Update preset
 * @body { "name": String, "tools": Array }
 * @returns Empty
 */
router.put(
  "/presets/:user/:preset",
  auth.checkToken,
  function (req, res, next) {
    axios
      .put(
        projectsURL + `presets/${req.params.user}/${req.params.preset}`,
        req.body,
        {
          httpsAgent: httpsAgent,
        }
      )
      .then((_) => res.sendStatus(204))
      .catch((err) => res.status(500).jsonp("Error updating preset"));
  }
);

/**
 * Delete preset
 * @body Empty
 * @returns Empty
 */
router.delete(
  "/presets/:user/:preset",
  auth.checkToken,
  function (req, res, next) {
    axios
      .delete(projectsURL + `presets/${req.params.user}/${req.params.preset}`, {
        httpsAgent: httpsAgent,
      })
      .then((_) => res.sendStatus(204))
      .catch((err) => res.status(500).jsonp("Error deleting preset"));
  }
);

/**
 * Get user's projects
 * @body Empty
 * @returns List of projects, each project has no information about it's images or tools
 */
router.get("/:user", auth.checkToken, function (req, res, next) {
  axios
    .get(projectsURL + `${req.params.user}`, { httpsAgent: httpsAgent })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error getting users"));
});

/**
 * Get user's project
 * @body Empty
 * @returns The required project
 */
router.get("/:user/:project", auth.checkToken, function (req, res, next) {
  axios
    .get(projectsURL + `${req.params.user}/${req.params.project}`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error getting project"));
});

/**
 * Get project image
 * @body Empty
 * @returns The image url
 */
router.get(
  "/:user/:project/img/:img",
  auth.checkToken,
  function (req, res, next) {
    axios
      .get(
        projectsURL +
        `${req.params.user}/${req.params.project}/img/${req.params.img}`,
        {
          httpsAgent: httpsAgent,
        }
      )
      .then((resp) => {
        res.status(200).send(resp.data);
      })
      .catch((err) => res.status(500).jsonp("Error getting project image"));
  }
);

/**
 * Get project images
 * @body Empty
 * @returns The project's images
 */
router.get("/:user/:project/imgs", auth.checkToken, function (req, res, next) {
  axios
    .get(projectsURL + `${req.params.user}/${req.params.project}/imgs`, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => {
      res.status(200).send(resp.data);
    })
    .catch((err) => res.status(500).jsonp("Error getting project images"));
});

/**
 * Get project's processment result
 * @body Empty
 * @returns The required results, sent as a zip
 */
router.get(
  "/:user/:project/process",
  auth.checkToken,
  function (req, res, next) {
    axios
      .get(projectsURL + `${req.params.user}/${req.params.project}/process`, {
        httpsAgent: httpsAgent,
        responseType: "arraybuffer",
      })
      .then((resp) => res.status(200).send(resp.data))
      .catch((err) =>
        res.status(500).jsonp("Error getting processing results file")
      );
  }
);

/**
 * Get project's processment result
 * @body Empty
 * @returns The required results, sent as [{img_id, img_name, url}]
 */
router.get(
  "/:user/:project/process/url",
  auth.checkToken,
  function (req, res, next) {
    axios
      .get(
        projectsURL + `${req.params.user}/${req.params.project}/process/url`,
        {
          httpsAgent: httpsAgent,
        }
      )
      .then((resp) => {
        res.status(200).send(resp.data);
      })
      .catch((err) =>
        res.status(500).jsonp("Error getting processing results")
      );
  }
);

/**
 * Create new user's project
 * @body { "name": String }
 * @returns Created project's data
 */
router.post("/:user", auth.checkToken, function (req, res, next) {
  axios
    .post(projectsURL + `${req.params.user}`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error creating new project"));
});

/**
 * Preview an image
 * @body Empty
 * @returns String indication preview is being processed
 */
router.post(
  "/:user/:project/preview/:img",
  auth.checkToken,
  function (req, res, next) {
    axios
      .post(
        projectsURL +
        `${req.params.user}/${req.params.project}/preview/${req.params.img}`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) => {
        console.log(err);
        res.status(500).jsonp("Error requesting image preview");
      });
  }
);

/**
 * Add image to project
 * @body Empty
 * @file Image to be added
 * @returns Post answer structure in case of success
 */
router.post(
  "/:user/:project/img",
  upload.single("image"),
  auth.checkToken,
  function (req, res, next) {
    const data = new FormData();
    data.append("image", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    axios
      .post(
        projectsURL + `${req.params.user}/${req.params.project}/img`,
        data,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          httpsAgent: httpsAgent,
        }
      )
      .then((resp) => res.sendStatus(201))
      .catch((err) => res.status(500).jsonp("Error adding image to project"));
  }
);

/**
 * Add tool to project
 * @body { "procedure": String, "params": Object }
 * @returns Post answer structure in case of success
 */
router.post("/:user/:project/tool", auth.checkToken, function (req, res, next) {
  axios
    .post(
      projectsURL + `${req.params.user}/${req.params.project}/tool`,
      req.body,
      { httpsAgent: httpsAgent }
    )
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => res.status(500).jsonp("Error adding tool to project"));
});

/**
 * Reorder tools of a project
 * @body [{ "position": Number, "procedure": String, "params": Object }] (Position is a unique number between 0 and req.body.length - 1)
 * @returns Post answer structure in case of success
 */
router.post(
  "/:user/:project/reorder",
  auth.checkToken,
  function (req, res, next) {
    axios
      .post(
        projectsURL + `${req.params.user}/${req.params.project}/reorder`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) => res.status(500).jsonp("Error reordering tools"));
  }
);

/**
 * Generate request to process a project
 * @body Empty
 * @returns String indicating process request has been created
 */
router.post(
  "/:user/:project/process",
  auth.checkToken,
  function (req, res, next) {
    axios
      .post(
        projectsURL + `${req.params.user}/${req.params.project}/process`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) =>
        res.status(500).jsonp("Error requesting project processing")
      );
  }
);

/**
 * Update a specific project
 * @body { "name": String }
 * @returns Empty
 */
router.put("/:user/:project", auth.checkToken, function (req, res, next) {
  axios
    .put(projectsURL + `${req.params.user}/${req.params.project}`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((_) => res.sendStatus(204))
    .catch((err) => res.status(500).jsonp("Error updating project details"));
});

/**
 * Update a tool from a project
 * @body { "params" : Object }
 * @returns Empty
 */
router.put(
  "/:user/:project/tool/:tool",
  auth.checkToken,
  function (req, res, next) {
    axios
      .put(
        projectsURL +
        `${req.params.user}/${req.params.project}/tool/${req.params.tool}`,
        req.body,
        { httpsAgent: httpsAgent }
      )
      .then((_) => res.sendStatus(204))
      .catch((err) => res.status(500).jsonp("Error updating tool params"));
  }
);

/**
 * Delete a user's project
 * @body Empty
 * @returns Empty
 */
router.delete("/:user/:project", auth.checkToken, function (req, res, next) {
  axios
    .delete(projectsURL + `${req.params.user}/${req.params.project}`, {
      httpsAgent: httpsAgent,
    })
    .then((_) => res.sendStatus(204))
    .catch((err) => res.status(500).jsonp("Error deleting project"));
});

/**
 * Remove an image from a user's project
 * @body Empty
 * @returns Empty
 */
router.delete(
  "/:user/:project/img/:img",
  auth.checkToken,
  function (req, res, next) {
    axios
      .delete(
        projectsURL +
        `${req.params.user}/${req.params.project}/img/${req.params.img}`,
        { httpsAgent: httpsAgent }
      )
      .then((_) => res.sendStatus(204))
      .catch((err) =>
        res.status(500).jsonp("Error deleting image from project")
      );
  }
);

/**
 * Remove a tool from a user's project
 * @body Empty
 * @returns Empty
 */
router.delete(
  "/:user/:project/tool/:tool",
  auth.checkToken,
  function (req, res, next) {
    axios
      .delete(
        projectsURL +
        `${req.params.user}/${req.params.project}/tool/${req.params.tool}`,
        { httpsAgent: httpsAgent }
      )
      .then((_) => res.sendStatus(204))
      .catch((err) =>
        res.status(500).jsonp("Error removing tool from project")
      );
  }
);

/**
 * Cancel project processing
 */
router.delete(
  "/:user/:project/process/cancel",
  auth.checkToken,
  function (req, res, next) {
    axios
      .delete(
        projectsURL + `${req.params.user}/${req.params.project}/process/cancel`,
        { httpsAgent: httpsAgent }
      )
      .then((_) => res.sendStatus(204))
      .catch((err) => res.status(500).jsonp("Error canceling project processing"));
  }
);

module.exports = router;
