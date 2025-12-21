const express = require('express');
const router = express.Router();
const sharesService = require('../services/sharesService');

// Create share
router.post('/', async (req, res, next) => {
    console.log("DEBUG: Shares Service - Received create share request");
    console.log("DEBUG: Request body:", JSON.stringify(req.body));
    try {
        const { projectId, permission, expiresIn, userId } = req.body;
        const ownerId = userId;

        if (!projectId || !permission) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!ownerId) {
            return res.status(400).json({ error: 'Missing user ID. Please try logging out and logging in again.' });
        }

        if (!['view', 'edit'].includes(permission)) {
            return res.status(400).json({ error: 'Invalid permission' });
        }

        const result = await sharesService.createShare(ownerId, projectId, permission, expiresIn);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
});

// Get share details
router.get('/:shareId', async (req, res, next) => {
    try {
        const { shareId } = req.params;
        const token = req.headers['x-share-token'];
        const userId = req.userId; // TODO: Extract from JWT

        const result = await sharesService.getShareDetails(shareId, token, userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Access shared project
router.post('/:shareId/access', async (req, res, next) => {
    try {
        const { shareId } = req.params;
        const { token } = req.body;
        const userId = req.userId; // Extract from JWT

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const result = await sharesService.accessShare(shareId, token, userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// List project shares
router.get('/project/:projectId', async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const userId = req.query.userId;

        const result = await sharesService.listProjectShares(projectId, userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Revoke share
router.delete('/:shareId', async (req, res, next) => {
    try {
        const { shareId } = req.params;
        const userId = req.body.userId;

        const result = await sharesService.revokeShare(shareId, userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Validate share
router.get('/:shareId/validate', async (req, res, next) => {
    try {
        const { shareId } = req.params;
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const result = await sharesService.validateShare(shareId, token);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Get shares for current user (projects shared with me)
router.get('/user/me', async (req, res, next) => {
    try {
        const userId = req.query.userId;

        const result = await sharesService.getUserShares(userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Get dashboard
router.get('/dashboard', async (req, res, next) => {
    try {
        const userId = req.query.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const result = await sharesService.getDashboard(userId, page, limit);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

/**
 * Validate share
 */
router.get("/:shareId/validate", async (req, res) => {
    try {
        const { shareId } = req.params;
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: "Token is required" });

        const result = await Shares.validateShare(shareId, token);
        res.json(result);
    } catch (err) {
        console.error("Error validating share:", err);
        res.status(400).json({ error: err.message, valid: false, reason: err.message });
    }
});

module.exports = router;
