const express = require("express");
const router = express.Router();
const axios = require("axios");
const https = require("https");
const auth = require("../auth/auth");

const SHARES_SERVICE = process.env.SHARES_SERVICE_URL || "https://shares:9003";

// Configure axios to accept self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

/**
 * Create share (PROTECTED - requires authenticated non-anonymous user)
 * @body { "projectId": String, "permission": String, "expiresIn": Number }
 * @returns Created share details
 */
router.post("/", auth.checkAuth, function (req, res, next) {
    // Include userId from JWT in the request body
    const payload = { ...req.body, userId: req.userId };
    console.log("Creating share with body:", JSON.stringify(payload));
    axios
        .post(SHARES_SERVICE + "/shares", payload, {
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(201).jsonp(resp.data))
        .catch((err) => {
            console.error("Error creating share:", err.message);
            console.error("Error response data:", err.response?.data);
            console.error("Error response status:", err.response?.status);
            const status = err.response?.status || 500;
            const message = err.response?.data?.error || "Error creating share";
            res.status(status).jsonp({ error: message });
        });
});

/**
 * Get share details (PROTECTED)
 * @params shareId
 * @returns Share details
 */
router.get("/:shareId", auth.checkAuth, function (req, res, next) {
    axios
        .get(SHARES_SERVICE + `/shares/${req.params.shareId}`, {
            headers: req.headers,
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error getting share details"));
});

/**
 * Access shared project (PROTECTED)
 * @params shareId
 * @body { "token": String }
 * @returns Access details
 */
router.post("/:shareId/access", auth.checkAuth, function (req, res, next) {
    // Include userId from JWT
    const payload = { ...req.body, userId: req.userId };
    axios
        .post(SHARES_SERVICE + `/shares/${req.params.shareId}/access`, payload, {
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => {
            console.error("Error accessing share:", err.response?.data || err.message);
            const status = err.response?.status || 500;
            const message = err.response?.data?.error || "Error accessing share";
            res.status(status).jsonp({ error: message });
        });
});

/**
 * List project shares (PROTECTED)
 * @params projectId
 * @returns List of shares for the project
 */
router.get("/project/:projectId", auth.checkAuth, function (req, res, next) {
    axios
        .get(SHARES_SERVICE + `/shares/project/${req.params.projectId}`, {
            params: { ...req.query, userId: req.userId },
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error getting project shares"));
});

/**
 * Revoke share (PROTECTED)
 * @params shareId
 * @returns Revoke confirmation
 */
router.delete("/:shareId", auth.checkAuth, function (req, res, next) {
    axios
        .delete(SHARES_SERVICE + `/shares/${req.params.shareId}`, {
            data: { ...req.body, userId: req.userId },
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error revoking share"));
});

/**
 * Validate share token (PUBLIC - needed for share link validation)
 * @params shareId
 * @query token
 * @returns Validation result
 */
router.get("/:shareId/validate", function (req, res, next) {
    axios
        .get(SHARES_SERVICE + `/shares/${req.params.shareId}/validate`, {
            params: req.query,
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error validating share"));
});

/**
 * Validate share token (legacy/alternative - PUBLIC)
 * @query token, shareId
 * @returns Validation result
 */
router.get("/validate", function (req, res, next) {
    axios
        .get(SHARES_SERVICE + "/shares/validate", {
            params: req.query,
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error validating share"));
});

/**
 * Get shares for current user - projects shared with me (PROTECTED)
 * @returns List of shares
 */
router.get("/user/me", auth.checkAuth, function (req, res, next) {
    axios
        .get(SHARES_SERVICE + "/shares/user/me", {
            params: { userId: req.userId },
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error getting user shares"));
});

/**
 * Get dashboard (PROTECTED)
 * @query page, limit
 * @returns Dashboard data
 */
router.get("/dashboard", auth.checkAuth, function (req, res, next) {
    axios
        .get(SHARES_SERVICE + "/shares/dashboard", {
            params: { ...req.query, userId: req.userId },
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error getting dashboard"));
});

module.exports = router;
