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
// Queue storage: projectId -> [userId, userId, ...]
const projectLocks = new Map();
const lockQueues = new Map();

function acquireLock(projectId, userId) {
    const existing = projectLocks.get(projectId);

    // If lock is held by someone else who is not expired
    if (existing && existing.expiresAt > Date.now() && existing.userId !== userId) {
        // Enqueue if not already in queue
        if (!lockQueues.has(projectId)) {
            lockQueues.set(projectId, []);
        }
        const queue = lockQueues.get(projectId);
        if (!queue.includes(userId)) {
            queue.push(userId);
            console.log(`User ${userId} added to lock queue for project ${projectId}. Position: ${queue.length}`);
        }
        return { acquired: false, lockedBy: existing.userId, queued: true, position: queue.indexOf(userId) + 1 };
    }

    // Refresh if already held by same user
    if (existing && existing.userId === userId) {
        if (existing.timeoutId) clearTimeout(existing.timeoutId);
        existing.expiresAt = Date.now() + 60 * 1000;
        existing.timeoutId = setTimeout(() => {
            handleLockExpiration(projectId);
        }, 60 * 1000);
        return { acquired: true, expiresAt: existing.expiresAt };
    }

    // Lock is free - acquire it
    if (existing?.timeoutId) {
        clearTimeout(existing.timeoutId);
    }

    const expiresAt = Date.now() + 60 * 1000;
    const timeoutId = setTimeout(() => {
        handleLockExpiration(projectId);
    }, 60 * 1000);

    projectLocks.set(projectId, { userId, expiresAt, timeoutId });
    console.log(`Lock acquired by ${userId} for project: ${projectId}`);

    // Remove from queue if they were in it
    if (lockQueues.has(projectId)) {
        const queue = lockQueues.get(projectId);
        const idx = queue.indexOf(userId);
        if (idx !== -1) {
            queue.splice(idx, 1);
        }
    }

    return { acquired: true, expiresAt };
}

function handleLockExpiration(projectId) {
    console.log(`Lock expired for project: ${projectId}`);
    const lock = projectLocks.get(projectId);
    if (lock) {
        projectLocks.delete(projectId);
        io.to(`project:${projectId}`).emit('lock-released', { projectId });

        // Auto-assign to next in queue
        processNextInQueue(projectId);
    }
}

function processNextInQueue(projectId) {
    if (lockQueues.has(projectId)) {
        const queue = lockQueues.get(projectId);
        if (queue.length > 0) {
            const nextUserId = queue.shift(); // FIFO
            console.log(`Auto-assigning lock to queued user ${nextUserId} for project ${projectId}`);

            // Acquire lock for next user
            const result = acquireLock(projectId, nextUserId);
            if (result.acquired) {
                // Notify the specific user they got the lock
                io.to(nextUserId).emit('lock-acquired', { projectId });
                // Notify everyone else
                io.to(`project:${projectId}`).emit('project-locked', {
                    projectId,
                    lockedBy: nextUserId,
                    expiresAt: result.expiresAt
                });
            }
        }
    }
}

function releaseLock(projectId, userId) {
    const existing = projectLocks.get(projectId);
    if (existing && existing.userId === userId) {
        clearTimeout(existing.timeoutId);
        projectLocks.delete(projectId);
        console.log(`Lock released by ${userId} for project: ${projectId}`);

        // Process queue immediately
        processNextInQueue(projectId);
        return true;
    }

    // Also allow removing oneself from queue if not holding lock
    if (lockQueues.has(projectId)) {
        const queue = lockQueues.get(projectId);
        const idx = queue.indexOf(userId);
        if (idx !== -1) {
            queue.splice(idx, 1);
            console.log(`User ${userId} removed from lock queue for project ${projectId}`);
            return true; // Return true to signal "action handled"
        }
    }

    return false;
}

function extendLock(projectId, userId) {
    const existing = projectLocks.get(projectId);
    if (existing && existing.userId === userId) {
        clearTimeout(existing.timeoutId);
        existing.expiresAt = Date.now() + 60 * 1000;
        existing.timeoutId = setTimeout(() => {
            handleLockExpiration(projectId);
        }, 60 * 1000);
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
                    // Also broadcast error to project room for shared users
                    if (msg_content.projectId) {
                        io.to(`project:${msg_content.projectId}`).emit("preview-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                    }
                    return;
                }

                const img_url = msg_content.img_url;
                // Emit to user room (for owner)
                io.to(msg_content.user).emit("preview-ready", img_url);
                // Also emit to project room (for shared users)
                if (msg_content.projectId) {
                    io.to(`project:${msg_content.projectId}`).emit("preview-ready", img_url);
                }
            }
            // Handle process messages
            else if (/update-client-process/.test(msg_content.messageId)) {
                if (msg_content.status == "error") {
                    const error_code = msg_content.errorCode;
                    const error_msg = msg_content.errorMsg;
                    io.to(msg_content.user).emit("process-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                    // Also broadcast error to project room for shared users
                    if (msg_content.projectId) {
                        io.to(`project:${msg_content.projectId}`).emit("process-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                    }
                    return;
                }

                // Emit to user room (for owner)
                io.to(msg_content.user).emit("process-update", msg_content.messageId);
                // Also emit to project room (for shared users)
                if (msg_content.projectId) {
                    io.to(`project:${msg_content.projectId}`).emit("process-update", msg_content.messageId);
                }
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
        } else if (result.queued) {
            socket.emit('lock-queued', { projectId, position: result.position });
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
