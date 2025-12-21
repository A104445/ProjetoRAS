const mongoose = require('mongoose');

const projectLockSchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        unique: true,
        index: true
    },
    editorId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    editorName: {
        type: String,
        default: null
    },
    editorSessionId: {
        type: String,
        default: null
    },
    lockedAt: {
        type: Date,
        default: null
    },
    lastActivity: {
        type: Date,
        default: null
    },
    inactivityWarningAt: {
        type: Date,
        default: null
    },
    lockExpiresAt: {
        type: Date,
        default: null
    },
    editQueue: [{
        userId: mongoose.Schema.Types.ObjectId,
        userName: String,
        sessionId: String,
        requestedAt: Date,
        position: Number
    }]
});

module.exports = mongoose.model('ProjectLock', projectLockSchema);
