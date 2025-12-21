const Share = require('../models/Share');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const lockManager = require('./lockManager');

// Dedicated connections to other microservices' databases
// Note: In a pure microservice architecture, we should call the services APIs instead.
// But for now we fix the direct DB access.
const projectsConnection = mongoose.createConnection(
    process.env.PROJECTS_MONGO_URI || "mongodb://projects_mongoDB:27018/project",
    { useNewUrlParser: true, useUnifiedTopology: true }
);

const usersConnection = mongoose.createConnection(
    process.env.USERS_MONGO_URI || "mongodb://users_mongoDB:27019/user",
    { useNewUrlParser: true, useUnifiedTopology: true }
);

const ProjectSchema = new mongoose.Schema({}, { strict: false });
const UserSchema = new mongoose.Schema({}, { strict: false });

const Project = projectsConnection.model('Project', ProjectSchema);
const User = usersConnection.model('User', UserSchema);


class SharesService {
    // Create share
    async createShare(ownerId, projectId, permission, expiresIn = null) {
        console.log(`DEBUG: Service createShare - ownerId: ${ownerId}, projectId: ${projectId}, permission: ${permission}`);

        // Verify project exists and user is owner
        // used global Project model


        const project = await Project.findOne({
            _id: new mongoose.Types.ObjectId(projectId)
        });

        console.log("DEBUG: Project lookup by ID result:", project ? "Found" : "Not Found");
        if (project) {
            console.log("DEBUG: Project user_id:", project.user_id);
            console.log("DEBUG: Project user_id type:", typeof project.user_id);
            console.log("DEBUG: OwnerId:", ownerId);
        }

        if (!project || project.user_id.toString() !== ownerId) {
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

        // Get project summary
        // used global Project model
        const project = await Project.findById(share.projectId);

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

        // Get project data
        // used global Project model
        const project = await Project.findById(share.projectId);

        if (!project) {
            throw new Error('Project not found');
        }

        // Create session ID
        const sessionId = uuidv4();

        // Get lock status
        const lockStatus = await lockManager.getLockStatus(share.projectId.toString());

        return {
            projectData: project,
            permission: share.permission,
            sessionId,
            role: 'reader', // Always starts as reader
            activeSessions: [], // TODO: Get from active_sessions collection
            lockStatus
        };
    }

    // List shares for a project
    async listProjectShares(projectId, userId) {
        // Verify ownership
        // used global Project model

        const project = await Project.findOne({
            _id: new mongoose.Types.ObjectId(projectId),
            user_id: new mongoose.Types.ObjectId(userId)
        });

        if (!project) {
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

        // Get project and owner info
        // used global Project and User models

        const project = await Project.findById(share.projectId);
        const owner = await User.findById(share.ownerId);

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

        // Get project details for each share
        // used global Project model

        const sharesWithProjects = await Promise.all(
            validShares.map(async (share) => {
                const project = await Project.findById(share.projectId);
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
