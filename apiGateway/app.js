var createError = require("http-errors");
var express = require("express");
var cors = require("cors");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var projectsRouter = require("./routes/projects");
var usersRouter = require("./routes/users");
var subscriptionsRouter = require("./routes/subscriptions");
var sharesRouter = require("./routes/shares");

var app = express();

// Enable CORS for all routes
app.use(cors());

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "api-gateway" });
});

// Routes
app.use("/projects", projectsRouter);
app.use("/users", usersRouter);
// Removido CORS do backend, controle feito pelo nginx

// Catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404, `Route not found: ${req.method} ${req.originalUrl}`));
});

// Global error handler
app.use(function (err, req, res, next) {
  // Determine status code
  const statusCode = err.status || err.statusCode || 500;

  // Log error details
  const errorLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    status: statusCode,
    message: err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  };

  // Log to console (will be captured by docker logs)
  if (statusCode >= 500) {
    console.error("Server Error:", JSON.stringify(errorLog, null, 2));
  } else if (statusCode >= 400) {
    console.warn("Client Error:", JSON.stringify(errorLog, null, 2));
  }

  // Build response object
  const errorResponse = {
    error: true,
    status: statusCode,
    message: err.message || getDefaultMessage(statusCode),
    ...(statusCode === 404 && {
      path: req.originalUrl,
    }),
    ...(process.env.NODE_ENV !== "production" && statusCode >= 500 && {
      stack: err.stack
    }),
  };

  // Send JSON response
  res.status(statusCode).json(errorResponse);
});
    // Removido CORS do backend, controle feito pelo nginx
function getDefaultMessage(statusCode) {
  const messages = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    408: "Request Timeout",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };
  return messages[statusCode] || "An error occurred";
}

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // Give time for logs to be written
  setTimeout(() => process.exit(1), 1000);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

module.exports = app;
