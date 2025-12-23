const express = require('express');
const router = express.Router();
const sharesService = require('../services/sharesService');
const { checkAuth, optionalAuth } = require('../config/auth');

// Create share (requires authentication)
router.post('/', checkAuth, async (req, res, next) => {
    console.log("DEBUG: Shares Service - Received create share request");
    console.log("DEBUG: Request body:", JSON.stringify(req.body));
    try {
        const { projectId, permission, expiresIn } = req.body;
        const ownerId = req.userId; // From auth middleware

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

// Get share details (requires authentication)
router.get('/:shareId', checkAuth, async (req, res, next) => {
    try {
        const { shareId } = req.params;
        const token = req.headers['x-share-token'];
        const userId = req.userId; // From auth middleware

        const result = await sharesService.getShareDetails(shareId, token, userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Access shared project (requires authentication)
router.post('/:shareId/access', checkAuth, async (req, res, next) => {
    try {
        const { shareId } = req.params;
        const { token } = req.body;
        const userId = req.userId; // From auth middleware

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const result = await sharesService.accessShare(shareId, token, userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// List project shares (requires authentication)
router.get('/project/:projectId', checkAuth, async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const userId = req.userId; // From auth middleware

        const result = await sharesService.listProjectShares(projectId, userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Revoke share (requires authentication)
router.delete('/:shareId', checkAuth, async (req, res, next) => {
    try {
        const { shareId } = req.params;
        const userId = req.userId; // From auth middleware

        const result = await sharesService.revokeShare(shareId, userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Validate share (public endpoint - no auth required)
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
        console.error("Error validating share:", error);
        res.status(400).json({ error: error.message, valid: false, reason: error.message });
    }
});

// Get shares for current user - projects shared with me (requires authentication)
router.get('/user/me', checkAuth, async (req, res, next) => {
    try {
        const userId = req.userId; // From auth middleware

        const result = await sharesService.getUserShares(userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Get dashboard (requires authentication)
router.get('/dashboard', checkAuth, async (req, res, next) => {
    try {
        const userId = req.userId; // From auth middleware
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const result = await sharesService.getDashboard(userId, page, limit);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
