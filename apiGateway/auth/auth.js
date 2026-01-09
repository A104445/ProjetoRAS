const jwt = require("jsonwebtoken");

/**
 * Middleware to check if user is authenticated and not anonymous.
 * Does not require :user param in route. Extracts userId from token and sets req.userId.
 * Blocks anonymous users from accessing protected routes.
 */
module.exports.checkAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  console.log("DEBUG checkAuth - Path:", req.path);
  console.log("DEBUG checkAuth - Auth header:", authHeader ? "Present" : "Missing");

  if (!authHeader) {
    console.log("DEBUG checkAuth - No auth header, returning 401");
    return res.status(401).json({ error: true, message: "Authorization header is required" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ error: true, message: "Invalid authorization format. Use: Bearer <token>" });
  }

  const token = parts[1];

  if (!token) {
    return res.status(401).json({ error: true, message: "Please provide a JWT token" });
  }

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, payload) => {
    if (err) {
      console.error("JWT verification error:", err.message);
      return res.status(401).json({ error: true, message: "Invalid JWT signature or token expired" });
    }

    try {
      const exp = payload.exp;

      if (Date.now() >= exp * 1000) {
        return res.status(401).json({ error: true, message: "JWT expired" });
      }

      // Get user type (default to 'free' for old JWTs without type field)
      const userType = payload.type || "free";

      // Set userId and userType on request for downstream handlers
      req.userId = payload.id;
      req.userType = userType;
      next();
    } catch (e) {
      console.error("JWT processing error:", e);
      return res.status(401).json({ error: true, message: "Invalid JWT" });
    }
  });
};

/**
 * Middleware for optional authentication.
 * If token is provided, validates it and sets req.userId.
 * If no token, allows the request to proceed without userId.
 * This is useful for endpoints that work for both authenticated and anonymous users.
 */
module.exports.optionalAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    // No auth header - proceed without userId
    return next();
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    // Invalid format - proceed without userId
    return next();
  }

  const token = parts[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, payload) => {
    if (err) {
      // Invalid token - proceed without userId
      return next();
    }

    try {
      const exp = payload.exp;

      if (Date.now() >= exp * 1000) {
        // Expired token - proceed without userId
        return next();
      }

      // Valid token - set userId and userType
      req.userId = payload.id;
      req.userType = payload.type;
      next();
    } catch (e) {
      next();
    }
  });
};

module.exports.checkToken = (req, res, next) => {
  const token = req.headers["authorization"].split(" ")[1];

  if (token === null || token === undefined) {
    res.status(401).jsonp(`Please provide a JWT token`);
    return;
  }

  jwt.verify(token, process.env.JWT_SECRET_KEY, (e, payload) => {
    if (e) {
      res.status(401).jsonp(`Invalid JWT signature or token expired.`);
      return;
    }

    try {
      const user = payload;
      const user_id = user.id;
      const exp = user.exp;

      if (Date.now() >= exp * 1000) {
        res.status(401).jsonp(`JWT expired.`);
        return;
      }

      if (user_id !== req.params.user) {
        res.status(401).jsonp(`Request's user and JWT's user don't match`);
        return;
      }

      next();
    } catch (_) {
      res.status(401).jsonp(`Invalid JWT`);
    }
  });
};
