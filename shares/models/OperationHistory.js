const mongoose = require('mongoose');

const operationHistorySchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['TOOL_ADD', 'TOOL_REMOVE', 'TOOL_UPDATE', 'TOOL_REORDER', 'IMAGE_ADD', 'IMAGE_REMOVE', 'PROJECT_RENAME']
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound index for efficient queries
operationHistorySchema.index({ projectId: 1, timestamp: -1 });

module.exports = mongoose.model('OperationHistory', operationHistorySchema);
