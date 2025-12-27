const http = require("http");
const socketIo = require('socket.io');
const jwt = require("jsonwebtoken");

const { read_rabbit_msg, send_rabbit_msg } = require("./utils/rabbit_mq.js");
const httpServer = http.createServer();
httpServer.listen(4000);

const io = socketIo(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "UPDATE", "DELETE"],
    },
});

// ==================== LOCK MANAGEMENT ====================
// In-memory lock storage: projectId -> { userId, expiresAt, timeoutId }
const projectLocks = new Map();

function acquireLock(projectId, userId) {
    const existing = projectLocks.get(projectId);

    if (existing && existing.expiresAt > Date.now()) {
        // Lock exists and not expired
        return { acquired: false, lockedBy: existing.userId };
    }

    // Clear old timeout if exists
    if (existing?.timeoutId) {
        clearTimeout(existing.timeoutId);
    }

    // Set new lock with 5 minute expiration
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const timeoutId = setTimeout(() => {
        console.log(`Lock expired for project: ${projectId}`);
        projectLocks.delete(projectId);
        io.to(`project:${projectId}`).emit('lock-released', { projectId });
    }, 5 * 60 * 1000);

    projectLocks.set(projectId, { userId, expiresAt, timeoutId });
    console.log(`Lock acquired by ${userId} for project: ${projectId}`);
    return { acquired: true, expiresAt };
}

function releaseLock(projectId, userId) {
    const existing = projectLocks.get(projectId);
    if (existing && existing.userId === userId) {
        clearTimeout(existing.timeoutId);
        projectLocks.delete(projectId);
        console.log(`Lock released by ${userId} for project: ${projectId}`);
        return true;
    }
    return false;
}

function extendLock(projectId, userId) {
    const existing = projectLocks.get(projectId);
    if (existing && existing.userId === userId) {
        clearTimeout(existing.timeoutId);
        existing.expiresAt = Date.now() + 5 * 60 * 1000;
        existing.timeoutId = setTimeout(() => {
            console.log(`Lock expired for project: ${projectId}`);
            projectLocks.delete(projectId);
            io.to(`project:${projectId}`).emit('lock-released', { projectId });
        }, 5 * 60 * 1000);
        return true;
    }
    return false;
}

function getLockStatus(projectId, userId) {
    const existing = projectLocks.get(projectId);
    if (!existing || existing.expiresAt <= Date.now()) {
        return { isLocked: false, lockedBy: null, hasLock: false, expiresAt: null };
    }
    return {
        isLocked: true,
        lockedBy: existing.userId,
        hasLock: existing.userId === userId,
        expiresAt: existing.expiresAt
    };
}

// ==================== RABBITMQ CONSUMER ====================

// Clean up function for RabbitMQ consumer
let wsChannel = null;

function setupRabbitMQ() {
    read_rabbit_msg("ws_queue", (msg) => {
        try {
            const msg_content = JSON.parse(msg.content.toString());
            console.log("Received RabbitMQ message:", msg_content);

            // Handle project updates
            if (msg_content.type === "project-update") {
                const { projectId, updateType, data } = msg_content;
                console.log(`Broadcasting project update: ${updateType} for ${projectId}`);
                io.to(`project:${projectId}`).emit("project-updated", {
                    projectId,
                    updateType,
                    data
                });
            }
            // Handle distributed lock events
            else if (msg_content.type === "lock-released") {
                console.log(`Broadcasting lock-released for project ${msg_content.projectId} from RabbitMQ`);
                io.to(`project:${msg_content.projectId}`).emit('lock-released', { projectId: msg_content.projectId });
            }
            // Handle preview messages
            else if (/update-client-preview/.test(msg_content.messageId)) {
                if (msg_content.status == "error") {
                    const error_code = msg_content.errorCode;
                    const error_msg = msg_content.errorMsg;
                    io.to(msg_content.user).emit("preview-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                    return;
                }

                const img_url = msg_content.img_url;
                io.to(msg_content.user).emit("preview-ready", img_url);
            }
            // Handle process messages
            else if (/update-client-process/.test(msg_content.messageId)) {
                if (msg_content.status == "error") {
                    const error_code = msg_content.errorCode;
                    const error_msg = msg_content.errorMsg;
                    io.to(msg_content.user).emit("process-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                    return;
                }

                io.to(msg_content.user).emit("process-update", msg_content.messageId);
            }
        } catch (e) {
            console.error("Error processing RabbitMQ message:", e);
        }
    });
}

setupRabbitMQ();

// ==================== LOCK HELPER ====================
// Helper to release lock and notify via RabbitMQ (Distributed pattern)
function releaseLockAndNotify(projectId, userId) {
    if (releaseLock(projectId, userId)) {
        // Publish lock-released event to RabbitMQ so all gateway instances catch it
        send_rabbit_msg({
            type: "lock-released",
            projectId: projectId,
            userId: userId
        }, "ws_queue");
        return true;
    }
    return false;
}

// ==================== SOCKET CONNECTIONS ====================
io.on("connection", (socket) => {
    console.log("A user connected");
    let userId = null;

    // Auth - extract userId from JWT
    const token = socket.handshake.auth.token;
    if (token != null) {
        jwt.verify(token, process.env.JWT_SECRET_KEY, (e, payload) => {
            if (e) {
                socket.emit('authError', e);
                return;
            }
            userId = payload.id;
            socket.userId = userId;
            console.log("User authenticated:", userId);
            socket.join(payload.id);
        });
    }

    // Join project room
    socket.on("join-project", (projectId) => {
        console.log(`User ${userId} joining project room: project:${projectId}`);
        socket.join(`project:${projectId}`);
        socket.projectId = projectId;
    });

    // Leave project room
    socket.on("leave-project", (projectId) => {
        console.log(`User ${userId} leaving project room: project:${projectId}`);
        socket.leave(`project:${projectId}`);
    });

    // Request lock (editors only)
    socket.on("request-lock", ({ projectId }) => {
        if (!userId) {
            socket.emit('lock-denied', { projectId, error: 'Not authenticated' });
            return;
        }

        const result = acquireLock(projectId, userId);

        if (result.acquired) {
            socket.emit('lock-acquired', { projectId });
            socket.to(`project:${projectId}`).emit('project-locked', {
                projectId,
                lockedBy: userId,
                expiresAt: result.expiresAt
            });
        } else {
            socket.emit('lock-denied', { projectId, lockedBy: result.lockedBy });
        }
    });

    // Release lock - Uses RabbitMQ for distributed notification
    socket.on("release-lock", ({ projectId }) => {
        releaseLockAndNotify(projectId, userId);
    });

    // Extend lock
    socket.on("extend-lock", ({ projectId }) => {
        if (extendLock(projectId, userId)) {
            socket.emit('lock-extended', { projectId });
        }
    });

    // Check lock status
    socket.on("check-lock", ({ projectId }) => {
        const status = getLockStatus(projectId, userId);
        socket.emit('lock-status', { projectId, ...status });
    });

    // Legacy: Frontend-triggered updates (backward compatibility)
    socket.on("project-updated", ({ projectId, updateType }) => {
        console.log(`Frontend broadcast for project: ${projectId}, type: ${updateType}`);
        socket.to(`project:${projectId}`).emit("project-updated", { projectId, updateType });
    });

    // Clean up on disconnect
    socket.on("disconnect", () => {
        console.log("User disconnected:", userId);
        if (socket.projectId && userId) {
            releaseLockAndNotify(socket.projectId, userId);
        }
    });
});

console.log("WebSocket Gateway started on port 4000");
