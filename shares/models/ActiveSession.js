const mongoose = require('mongoose');

const activeSessionSchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        unique: true,
        index: true
    },
    sessions: [{
        sessionId: String,
        userId: mongoose.Schema.Types.ObjectId,
        userName: String,
        permission: {
            type: String,
            enum: ['owner', 'view', 'edit']
        },
        role: {
            type: String,
            enum: ['reader', 'editor']
        },
        connectedAt: Date,
        lastActivity: Date,
        isActive: Boolean
    }]
});

module.exports = mongoose.model('ActiveSession', activeSessionSchema);
