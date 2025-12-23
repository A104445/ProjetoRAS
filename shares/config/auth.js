const jwt = require("jsonwebtoken");

/**
 * Middleware to check if user is authenticated.
 * Extracts userId and userType from JWT token and sets on req object.
 * 
 * This middleware is for the shares service internal routes.
 * The API Gateway already validates tokens, but we need to extract user info here.
 */
function checkAuth(req, res, next) {
    const authHeader = req.headers["authorization"];

    // If no auth header, check if userId was passed in query or body (from API Gateway)
    if (!authHeader) {
        // Allow requests that come from API Gateway with userId in body/query
        if (req.body?.userId || req.query?.userId) {
            req.userId = req.body?.userId || req.query?.userId;
            req.userName = req.body?.userName || req.query?.userName || "Unknown User";
            return next();
        }
        return res.status(401).json({ error: true, message: "Authorization required" });
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return res.status(401).json({ error: true, message: "Invalid authorization format" });
    }

    const token = parts[1];

    jwt.verify(token, process.env.JWT_SECRET_KEY || "lisan_al_gaib", (err, payload) => {
        if (err) {
            console.error("JWT verification error:", err.message);
            return res.status(401).json({ error: true, message: "Invalid or expired token" });
        }

        try {
            if (Date.now() >= payload.exp * 1000) {
                return res.status(401).json({ error: true, message: "Token expired" });
            }

            // Block anonymous users
            if (payload.type === "anonymous") {
                return res.status(403).json({
                    error: true,
                    message: "Anonymous users cannot access this resource"
                });
            }

            // Set user info on request
            req.userId = payload.id;
            req.userType = payload.type;
            // userName needs to be fetched or passed - for now use a placeholder
            req.userName = payload.name || "User";

            next();
        } catch (e) {
            console.error("JWT processing error:", e);
            return res.status(401).json({ error: true, message: "Invalid token" });
        }
    });
}

/**
 * Optional auth middleware - extracts user info if available, but doesn't require it.
 * Useful for public endpoints that behave differently for authenticated users.
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers["authorization"];

    // Check body/query for userId (passed from API Gateway)
    if (req.body?.userId || req.query?.userId) {
        req.userId = req.body?.userId || req.query?.userId;
        req.userName = req.body?.userName || req.query?.userName || "Unknown User";
        return next();
    }

    if (!authHeader) {
        return next();
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return next();
    }

    const token = parts[1];

    jwt.verify(token, process.env.JWT_SECRET_KEY || "lisan_al_gaib", (err, payload) => {
        if (!err && payload) {
            req.userId = payload.id;
            req.userType = payload.type;
            req.userName = payload.name || "User";
        }
        next();
    });
}

module.exports = { checkAuth, optionalAuth };
