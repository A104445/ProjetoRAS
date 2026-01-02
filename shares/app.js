var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const mongoose = require("mongoose");
const { connectRedis } = require("./config/redis");

const sharesRouter = require("./routes/shares");
const locksRouter = require("./routes/locks");
const { connect: connectRabbitMQ } = require("./utils/rabbit_mq");
const { startConsumer: startLocksConsumer } = require("./services/locksConsumer");

// MongoDB connection
const mongoDB = process.env.MONGO_URI || "mongodb://shares_mongoDB:27020/shares";

mongoose.connect(mongoDB, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;

db.on("error", console.error.bind(console, "Error connecting to MongoDB"));
db.once("open", () => {
    console.log("✅ MongoDB connection successful");

    // Connect to Redis after MongoDB is ready
    connectRedis().then(async () => {
        // Start background jobs
        require("./services/lockManager").startBackgroundJobs();

        // Connect to RabbitMQ and start locks consumer
        try {
            await connectRabbitMQ();
            await startLocksConsumer();
            console.log("✅ Locks RPC consumer ready");
        } catch (err) {
            console.error("❌ RabbitMQ setup failed:", err);
        }
    }).catch(err => {
        console.error("❌ Redis connection failed:", err);
    });
});

var app = express();

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use((req, res, next) => {
    console.log("Request received:", req.method, req.url);
    next();
});

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "shares" });
});

// Routes
app.use("/shares", sharesRouter);
app.use("/shares/lock", locksRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};

    res.status(err.status || 500).json({
        error: err.message || "Internal server error"
    });
});

module.exports = app;
