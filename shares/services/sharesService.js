const Share = require('../models/Share');
const ActiveSession = require('../models/ActiveSession');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const lockManager = require('./lockManager');
const notifications = require('./notificationService');
const { ProjectsAPI, UsersAPI } = require('./apiClient');


class SharesService {
    // Create share
    async createShare(ownerId, projectId, permission, expiresIn = null) {
        console.log(`DEBUG: Service createShare - ownerId: ${ownerId}, projectId: ${projectId}, permission: ${permission}`);

        // Verify project exists and user is owner via API
        const ownershipResult = await ProjectsAPI.verifyProjectOwnership(projectId, ownerId);

        console.log("DEBUG: Ownership verification result:", ownershipResult);

        if (!ownershipResult.exists || !ownershipResult.isOwner) {
            console.error(`DEBUG: Project not found or ownership mismatch. ProjectId: ${projectId}, OwnerId: ${ownerId}`);
            throw new Error('Project not found or you are not the owner');
        }

        // Generate share ID and token
        const shareId = uuidv4();
        const token = crypto.randomBytes(32).toString('hex'); // 64 characters

        const share = new Share({
            shareId,
            projectId: new mongoose.Types.ObjectId(projectId),
            ownerId: new mongoose.Types.ObjectId(ownerId),
            permission,
            token,
            isActive: true,
            createdAt: new Date(),
            expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
        });

        await share.save();

        const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
        const shareUrl = `${baseUrl}/share/${shareId}?token=${token}`;

        return {
            shareId,
            shareUrl,
            token,
            expiresAt: share.expiresAt
        };
    }

    // Get share details
    async getShareDetails(shareId, token = null, userId = null) {
        const share = await Share.findOne({
            shareId,
            isActive: true
        });

        if (!share) {
            throw new Error('Share not found');
        }

        // Check if revoked
        if (share.revokedAt) {
            const error = new Error('Share has been revoked');
            error.status = 410;
            throw error;
        }

        // Check if expired
        if (share.expiresAt && share.expiresAt < new Date()) {
            const error = new Error('Share has expired');
            error.status = 410;
            throw error;
        }

        // Check permission
        const isOwner = userId && share.ownerId.toString() === userId;
        const hasValidToken = token && share.token === token;

        if (!isOwner && !hasValidToken) {
            const error = new Error('Unauthorized');
            error.status = 403;
            throw error;
        }

        // Get project summary via API
        const project = await ProjectsAPI.getProjectById(share.projectId.toString());

        return {
            share: {
                shareId: share.shareId,
                permission: share.permission,
                createdAt: share.createdAt,
                expiresAt: share.expiresAt,
                accessCount: share.accessCount
            },
            project: project ? {
                name: project.name,
                imageCount: project.imgs?.length || 0,
                toolCount: project.tools?.length || 0
            } : null
        };
    }

    // Access project via share
    async accessShare(shareId, token, userId = null) {
        const share = await Share.findOne({
            shareId,
            token,
            isActive: true
        });

        if (!share) {
            throw new Error('Invalid share link or token');
        }

        // Check if revoked or expired
        if (share.revokedAt) {
            const error = new Error('Share has been revoked');
            error.status = 410;
            throw error;
        }

        if (share.expiresAt && share.expiresAt < new Date()) {
            const error = new Error('Share has expired');
            error.status = 410;
            throw error;
        }

        // Update access count
        share.accessCount++;
        share.lastAccessedAt = new Date();

        // Track user access if userId is provided
        if (userId) {
            const userIdObj = new mongoose.Types.ObjectId(userId);
            const existingAccess = share.accessedBy.find(
                a => a.userId.toString() === userId
            );

            if (existingAccess) {
                // Update last accessed time
                existingAccess.lastAccessed = new Date();
            } else {
                // Add new user access
                share.accessedBy.push({
                    userId: userIdObj,
                    firstAccessed: new Date(),
                    lastAccessed: new Date()
                });
            }
        }

        await share.save();

        // Get project data via API
        const project = await ProjectsAPI.getProjectById(share.projectId.toString());

        if (!project) {
            throw new Error('Project not found');
        }

        // Add user to project permissions if authenticated
        if (userId) {
            const role = share.permission; // "view" or "edit"
            const permResult = await ProjectsAPI.addPermission(
                share.projectId.toString(),
                userId,
                role
            );
            if (permResult) {
                console.log(`Added ${role} permission for user ${userId} to project ${share.projectId}`);
            } else {
                console.warn(`Failed to add permission for user ${userId} to project ${share.projectId}`);
            }
        }

        // Create session ID
        const sessionId = uuidv4();

        // Get or create active sessions record
        let activeSessionDoc = await ActiveSession.findOne({
            projectId: share.projectId
        });

        if (!activeSessionDoc) {
            activeSessionDoc = new ActiveSession({
                projectId: share.projectId,
                sessions: []
            });
        }

        // Get user info via API if available
        let userName = 'Guest';
        if (userId) {
            try {
                const user = await UsersAPI.getUser(userId);
                userName = user?.name || 'User';
            } catch (e) {
                console.error('Error fetching user:', e);
            }
        }

        // Add new session
        const newSession = {
            sessionId,
            userId: userId ? new mongoose.Types.ObjectId(userId) : null,
            userName,
            permission: share.permission,
            role: 'reader',
            connectedAt: new Date(),
            lastActivity: new Date(),
            isActive: true
        };

        activeSessionDoc.sessions.push(newSession);
        await activeSessionDoc.save();

        // Get active sessions (filter out inactive ones)
        const activeSessions = activeSessionDoc.sessions
            .filter(s => s.isActive)
            .map(s => ({
                sessionId: s.sessionId,
                userId: s.userId?.toString(),
                userName: s.userName,
                permission: s.permission,
                role: s.role,
                connectedAt: s.connectedAt
            }));

        // Get lock status
        const lockStatus = await lockManager.getLockStatus(share.projectId.toString());

        // Notify other users about new session
        if (userId) {
            await notifications.notifyUserJoined(
                share.projectId.toString(),
                userId,
                userName,
                'reader'
            );
        }

        return {
            projectData: project,
            permission: share.permission,
            sessionId,
            role: 'reader', // Always starts as reader
            activeSessions,
            lockStatus
        };
    }

    // List shares for a project
    async listProjectShares(projectId, userId) {
        // Verify ownership via API
        const ownershipResult = await ProjectsAPI.verifyProjectOwnership(projectId, userId);

        if (!ownershipResult.exists || !ownershipResult.isOwner) {
            const error = new Error('Project not found or you are not the owner');
            error.status = 403;
            throw error;
        }

        const shares = await Share.find({
            projectId: new mongoose.Types.ObjectId(projectId),
            isActive: true,
            revokedAt: null
        });

        return {
            shares,
            totalCount: shares.length
        };
    }

    // Revoke share
    async revokeShare(shareId, userId) {
        const share = await Share.findOne({ shareId });

        if (!share) {
            throw new Error('Share not found');
        }

        // Verify ownership
        if (share.ownerId.toString() !== userId) {
            const error = new Error('You are not the owner');
            error.status = 403;
            throw error;
        }

        const revokedAt = new Date();
        share.revokedAt = revokedAt;
        share.isActive = false;
        await share.save();

        return {
            success: true,
            revokedAt
        };
    }

    // Validate share
    async validateShare(shareId, token) {
        const share = await Share.findOne({ shareId, token });

        if (!share) {
            return {
                valid: false,
                reason: 'Share not found'
            };
        }

        if (share.revokedAt) {
            return {
                valid: false,
                reason: 'Share has been revoked'
            };
        }

        if (share.expiresAt && share.expiresAt < new Date()) {
            return {
                valid: false,
                reason: 'Share has expired'
            };
        }

        // Get project and owner info via APIs
        const project = await ProjectsAPI.getProjectById(share.projectId.toString());
        const owner = await UsersAPI.getUser(share.ownerId.toString());

        return {
            valid: true,
            permission: share.permission,
            projectName: project?.name || 'Unknown',
            ownerName: owner?.name || 'Unknown'
        };
    }

    // Get dashboard
    async getDashboard(userId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;

        // Owned shares
        const ownedShares = await Share.find({
            ownerId: new mongoose.Types.ObjectId(userId),
            isActive: true
        })
            .skip(skip)
            .limit(limit);

        const totalOwned = await Share.countDocuments({
            ownerId: new mongoose.Types.ObjectId(userId),
            isActive: true
        });

        // Received shares (shared with me)
        const receivedSharesResult = await this.getUserShares(userId);
        const receivedShares = receivedSharesResult.shares;
        const totalReceived = receivedSharesResult.totalCount;

        return {
            ownedShares,
            receivedShares,
            totalOwned,
            totalReceived
        };
    }

    // Get shares accessed by a user (projects shared with this user)
    async getUserShares(userId) {
        const shares = await Share.find({
            'accessedBy.userId': new mongoose.Types.ObjectId(userId),
            isActive: true,
            revokedAt: null
        });

        // Filter out expired shares
        const validShares = shares.filter(share => {
            return !share.expiresAt || share.expiresAt > new Date();
        });

        // Get project details for each share via API
        const sharesWithProjects = await Promise.all(
            validShares.map(async (share) => {
                const project = await ProjectsAPI.getProjectById(share.projectId.toString());
                const userAccess = share.accessedBy.find(
                    a => a.userId.toString() === userId
                );

                return {
                    shareId: share.shareId,
                    projectId: share.projectId,
                    projectName: project?.name || 'Unknown',
                    permission: share.permission,
                    ownerId: share.ownerId,
                    firstAccessed: userAccess?.firstAccessed,
                    lastAccessed: userAccess?.lastAccessed,
                    accessCount: share.accessCount
                };
            })
        );

        return {
            shares: sharesWithProjects,
            totalCount: sharesWithProjects.length
        };
    }
}

module.exports = new SharesService();
