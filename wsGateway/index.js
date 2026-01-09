const http = require("http");
const socketIo = require('socket.io');
const jwt = require("jsonwebtoken");

const { read_rabbit_msg } = require("./utils/rabbit_mq.js");
const locksAdapter = require("./utils/locksAdapter.js");

const httpServer = http.createServer();
httpServer.listen(4000);

const io = socketIo(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "UPDATE", "DELETE"],
    },
});

// ==================== INITIALIZATION ====================

async function initialize() {
    // Initialize locks adapter (RPC over RabbitMQ)
    const adapterReady = await locksAdapter.init();
    if (!adapterReady) {
        console.error("Locks adapter failed to initialize - lock features will not work");
    }

    // Setup RabbitMQ consumer for notifications
    setupRabbitMQ();

    console.log("WebSocket Gateway started on port 4000");
}

// ==================== RABBITMQ CONSUMER ====================

function setupRabbitMQ() {
    // 1. Consumidor Principal (WS Queue) - Lógica Existente
    read_rabbit_msg("ws_queue", (msg) => {
        try {
            const msg_content = JSON.parse(msg.content.toString());
            console.log("Received RabbitMQ message:", msg_content.type || msg_content.messageId);

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
            // Handle lock released (from shares service)
            else if (msg_content.type === "lock-released") {
                console.log(`Broadcasting lock-released for project ${msg_content.projectId}`);
                io.to(`project:${msg_content.projectId}`).emit('lock-released', {
                    projectId: msg_content.projectId,
                    releasedBy: msg_content.releasedBy
                });

                // If there's a next editor, notify them
                if (msg_content.nextEditor) {
                    io.to(msg_content.nextEditor.userId).emit('lock-acquired', {
                        projectId: msg_content.projectId
                    });
                    io.to(`project:${msg_content.projectId}`).emit('project-locked', {
                        projectId: msg_content.projectId,
                        lockedBy: msg_content.nextEditor.userId,
                        lockedByName: msg_content.nextEditor.userName
                    });
                }
            }
            // Handle lock acquired broadcast (for other users in room)
            else if (msg_content.type === "lock-acquired-broadcast") {
                io.to(`project:${msg_content.projectId}`).emit('project-locked', {
                    projectId: msg_content.projectId,
                    lockedBy: msg_content.editorId,
                    lockedByName: msg_content.editorName,
                    expiresAt: msg_content.expiresAt
                });
            }
            // Handle lock expired
            else if (msg_content.type === "lock-expired") {
                // Notify the user who lost the lock
                io.to(msg_content.userId).emit('lock-expired', {
                    projectId: msg_content.projectId,
                    reason: msg_content.reason
                });
                // Also notify the project room
                io.to(`project:${msg_content.projectId}`).emit('lock-released', {
                    projectId: msg_content.projectId,
                    reason: 'timeout'
                });
            }
            // Handle inactivity warning
            else if (msg_content.type === "lock-inactivity-warning") {
                // Notify user by userId (they are in a room with their userId)
                io.to(msg_content.userId).emit('lock-inactivity-warning', {
                    projectId: msg_content.projectId,
                    expiresIn: msg_content.expiresIn
                });
            }
            // Handle queue updates
            else if (msg_content.type === "lock-queue-update") {
                msg_content.queue.forEach(item => {
                    io.to(item.userId).emit('lock-queue-position', {
                        projectId: msg_content.projectId,
                        position: item.position,
                        estimatedWait: item.estimatedWait
                    });
                });
            }
            // Handle user promoted from queue
            else if (msg_content.type === "lock-promoted") {
                io.to(msg_content.userId).emit('lock-acquired', {
                    projectId: msg_content.projectId,
                    expiresAt: msg_content.expiresAt
                });
                io.to(`project:${msg_content.projectId}`).emit('project-locked', {
                    projectId: msg_content.projectId,
                    lockedBy: msg_content.userId,
                    lockedByName: msg_content.userName,
                    expiresAt: msg_content.expiresAt
                });
            }
            // Handle lock lost
            else if (msg_content.type === "lock-lost") {
                // Notify user by userId
                io.to(msg_content.userId).emit('lock-lost', {
                    projectId: msg_content.projectId,
                    reason: msg_content.reason
                });
            }
            // Handle preview messages
            else if (/update-client-preview/.test(msg_content.messageId)) {
                if (msg_content.status == "error") {
                    const error_code = msg_content.errorCode;
                    const error_msg = msg_content.errorMsg;
                    io.to(msg_content.user).emit("preview-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                    if (msg_content.projectId) {
                        io.to(`project:${msg_content.projectId}`).emit("preview-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                    }
                    return;
                }

                const img_url = msg_content.img_url;
                io.to(msg_content.user).emit("preview-ready", img_url);
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
                    if (msg_content.projectId) {
                        io.to(`project:${msg_content.projectId}`).emit("process-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                    }
                    return;
                }

                io.to(msg_content.user).emit("process-update", msg_content.messageId);
                if (msg_content.projectId) {
                    io.to(`project:${msg_content.projectId}`).emit("process-update", msg_content.messageId);
                }
            }
        } catch (e) {
            console.error("Error processing RabbitMQ message:", e);
        }
    });

    // 2. [NOVO] Consumidor de Eventos de Partilha (Share Events Queue)
    // Escuta a fila 'share_events_queue' para notificações de reordenação e outros eventos de colaboração
    read_rabbit_msg("share_events_queue", (msg) => {
        try {
            const event = JSON.parse(msg.content.toString());
            console.log(`[WS Share] Event received: ${event.type} for project ${event.projectId}`);

            // Envia para a sala do projeto, garantindo que eventos como 'tools-reordered' chegam ao frontend
            if (event.projectId) {
                // Se o evento vier com payload dentro de 'data', usa-o, senão usa o próprio evento
                const payload = event.payload || event.data || event;
                io.to(`project:${event.projectId}`).emit(event.type, payload);
            }
        } catch (e) {
            console.error("Error processing Share Queue message:", e);
        }
    });
}

// ==================== SOCKET CONNECTIONS ====================

io.on("connection", (socket) => {
    console.log("A user connected");
    let userId = null;
    let userName = null;

    // Auth - extract userId from JWT
    const token = socket.handshake.auth.token;
    if (token != null) {
        jwt.verify(token, process.env.JWT_SECRET_KEY, (e, payload) => {
            if (e) {
                socket.emit('authError', e);
                return;
            }
            userId = payload.id;
            userName = payload.name || payload.email || 'Unknown';
            socket.userId = userId;
            socket.userName = userName;

            // Track all projects this user has requested locks for
            socket.lockedProjects = new Set();

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

    // Request lock (editors only) - delegates to shares via adapter
    socket.on("request-lock", async ({ projectId }) => {
        if (!userId) {
            socket.emit('lock-denied', { projectId, error: 'Not authenticated' });
            return;
        }

        // Track this project for cleanup on disconnect
        if (socket.lockedProjects) {
            socket.lockedProjects.add(projectId);
        }

        try {
            const result = await locksAdapter.acquireLock(projectId, userId, userName, socket.id);

            if (result.acquired) {
                socket.emit('lock-acquired', { projectId, expiresAt: result.expiresAt });
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
        } catch (error) {
            console.error("request-lock error:", error);
            socket.emit('lock-denied', { projectId, error: error.message });
        }
    });

    // Release lock - delegates to shares via adapter
    socket.on("release-lock", async ({ projectId }) => {
        if (!userId) return;

        try {
            const released = await locksAdapter.releaseLock(projectId, userId);
            if (released) {
                socket.to(`project:${projectId}`).emit('lock-released', { projectId });
                // Stop tracking this project
                if (socket.lockedProjects) {
                    socket.lockedProjects.delete(projectId);
                }
            }
        } catch (error) {
            console.error("release-lock error:", error);
        }
    });

    // Check lock status - delegates to shares via adapter
    socket.on("check-lock", async ({ projectId }) => {
        try {
            const status = await locksAdapter.getLockStatus(projectId, userId);
            socket.emit('lock-status', { projectId, ...status });
        } catch (error) {
            console.error("check-lock error:", error);
            socket.emit('lock-status', { projectId, isLocked: false, hasLock: false });
        }
    });

    // Legacy: Frontend-triggered updates (backward compatibility)
    socket.on("project-updated", ({ projectId, updateType }) => {
        console.log(`Frontend broadcast for project: ${projectId}, type: ${updateType}`);
        socket.to(`project:${projectId}`).emit("project-updated", { projectId, updateType });
    });

    // Clean up on disconnect
    socket.on("disconnect", async () => {
        console.log("User disconnected:", userId, "cleaning up projects:", socket.lockedProjects ? Array.from(socket.lockedProjects) : []);

        // Cleanup all projects this user was involved with
        if (socket.lockedProjects && socket.lockedProjects.size > 0) {
            for (const projectId of socket.lockedProjects) {
                try {
                    // Try to release lock if they have it
                    await locksAdapter.releaseLock(projectId, userId);
                    // Also remove from queue if they're waiting
                    await locksAdapter.removeFromQueue(projectId, userId);
                    console.log(`Cleaned up project ${projectId} for user ${userId}`);
                } catch (error) {
                    console.error(`Error cleaning up ${projectId} on disconnect:`, error);
                }
            }
            socket.lockedProjects.clear();
        }
    });
});

// Start the gateway
initialize();
