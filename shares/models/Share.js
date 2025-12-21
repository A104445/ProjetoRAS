const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
    shareId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    permission: {
        type: String,
        enum: ['view', 'edit'],
        required: true
    },
    token: {
        type: String,
        required: true,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        default: null
    },
    revokedAt: {
        type: Date,
        default: null
    },
    accessCount: {
        type: Number,
        default: 0
    },
    lastAccessedAt: {
        type: Date,
        default: null
    },
    accessedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        firstAccessed: {
            type: Date,
            default: Date.now
        },
        lastAccessed: {
            type: Date,
            default: Date.now
        }
    }]
});

module.exports = mongoose.model('Share', shareSchema);
