const express = require('express');
const router = express.Router();
const lockManager = require('../services/lockManager');

// Request lock
router.post('/:projectId/request', async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const userId = req.userId; // TODO: Extract from JWT
        const userName = req.userName; // TODO: Extract from JWT
        const sessionId = req.body.sessionId || req.sessionID;

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
        const userId = req.userId; // TODO: Extract from JWT

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
        const userId = req.userId; // TODO: Extract from JWT
        const { stillEditing } = req.body;

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
        const userId = req.userId; // TODO: Extract from JWT

        const result = await lockManager.getQueueStatus(projectId);

        // Find user position
        const userPosition = result.queue.findIndex(q => q.userId.toString() === userId);
        const estimatedWaitTime = userPosition >= 0 ? (userPosition + 1) * 5 * 60 : null;

        res.json({
            ...result,
            userPosition: userPosition >= 0 ? userPosition + 1 : null,
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
        const userId = req.userId; // TODO: Extract from JWT

        const queueStatus = await lockManager.getQueueStatus(projectId);
        const userInQueue = queueStatus.queue.find(q => q.userId.toString() === userId);

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
