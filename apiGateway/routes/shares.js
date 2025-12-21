const express = require("express");
const router = express.Router();
const axios = require("axios");
const https = require("https");

const SHARES_SERVICE = process.env.SHARES_SERVICE_URL || "https://shares:9003";

// Configure axios to accept self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

/**
 * Create share
 * @body { "projectId": String, "permission": String, "expiresIn": Number }
 * @returns Created share details
 */
router.post("/", function (req, res, next) {
    console.log("Creating share with body:", JSON.stringify(req.body));
    axios
        .post(SHARES_SERVICE + "/shares", req.body, {
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
 * Get share details
 * @params shareId
 * @returns Share details
 */
router.get("/:shareId", function (req, res, next) {
    axios
        .get(SHARES_SERVICE + `/shares/${req.params.shareId}`, {
            headers: req.headers,
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error getting share details"));
});

/**
 * Access shared project
 * @params shareId
 * @body { "token": String }
 * @returns Access details
 */
router.post("/:shareId/access", function (req, res, next) {
    axios
        .post(SHARES_SERVICE + `/shares/${req.params.shareId}/access`, req.body, {
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error accessing share"));
});

/**
 * List project shares
 * @params projectId
 * @returns List of shares for the project
 */
router.get("/project/:projectId", function (req, res, next) {
    axios
        .get(SHARES_SERVICE + `/shares/project/${req.params.projectId}`, {
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error getting project shares"));
});

/**
 * Revoke share
 * @params shareId
 * @returns Revoke confirmation
 */
router.delete("/:shareId", function (req, res, next) {
    axios
        .delete(SHARES_SERVICE + `/shares/${req.params.shareId}`, {
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error revoking share"));
});

/**
 * Validate share token
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
 * Validate share token (legacy/alternative)
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
 * Get shares for current user (projects shared with me)
 * @returns List of shares
 */
router.get("/user/me", function (req, res, next) {
    axios
        .get(SHARES_SERVICE + "/shares/user/me", {
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error getting user shares"));
});

/**
 * Get dashboard
 * @query page, limit
 * @returns Dashboard data
 */
router.get("/dashboard", function (req, res, next) {
    axios
        .get(SHARES_SERVICE + "/shares/dashboard", {
            params: req.query,
            httpsAgent: httpsAgent,
        })
        .then((resp) => res.status(200).jsonp(resp.data))
        .catch((err) => res.status(500).jsonp("Error getting dashboard"));
});

module.exports = router;
