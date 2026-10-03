"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, next) {
    console.error("[Unhandled Error]:", err);
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json({
        success: false,
        message,
        errors: err.errors || null,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
}
//# sourceMappingURL=error.middleware.js.map