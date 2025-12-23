const express = require('express');
const router = express.Router();
const lockManager = require('../services/lockManager');
const { checkAuth } = require('../config/auth');

// Apply auth middleware to all lock routes
router.use(checkAuth);

// Request lock
router.post('/:projectId/request', async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const userId = req.userId;
        const userName = req.userName;
        const sessionId = req.body.sessionId || req.sessionID || `session-${Date.now()}`;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const result = await lockManager.acquireLock(projectId, userId, userName, sessionId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Release lock
router.post('/:projectId/release', async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const result = await lockManager.releaseLock(projectId, userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Heartbeat / Keep alive
router.post('/:projectId/keepalive', async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const userId = req.userId;
        const { stillEditing } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        if (stillEditing === false) {
            // User wants to release lock
            const result = await lockManager.releaseLock(projectId, userId);
            return res.json({ lockExtended: false, ...result });
        }

        // Process heartbeat
        const result = await lockManager.processHeartbeat(projectId, userId);

        if (result.success) {
            const newExpiresAt = new Date(Date.now() + 7 * 60 * 1000);
            res.json({ lockExtended: true, newExpiresAt });
        } else {
            res.json(result);
        }
    } catch (error) {
        next(error);
    }
});

// Get queue status
router.get('/:projectId/queue', async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const userId = req.userId;

        const result = await lockManager.getQueueStatus(projectId);

        // Find user position
        let userPosition = null;
        if (userId && result.queue) {
            const idx = result.queue.findIndex(q => q.userId?.toString() === userId?.toString());
            userPosition = idx >= 0 ? idx + 1 : null;
        }
        const estimatedWaitTime = userPosition ? userPosition * 5 * 60 : null;

        res.json({
            ...result,
            userPosition,
            estimatedWaitTime
        });
    } catch (error) {
        next(error);
    }
});

// Leave queue
router.delete('/:projectId/queue', async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const queueStatus = await lockManager.getQueueStatus(projectId);
        const userInQueue = queueStatus.queue?.find(q => q.userId?.toString() === userId?.toString());

        if (!userInQueue) {
            return res.status(404).json({ error: 'You are not in the queue' });
        }

        const removedFrom = userInQueue.position;
        await lockManager.removeFromQueue(projectId, userId);

        res.json({ success: true, removedFrom });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
