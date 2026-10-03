"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../lib/jwt");
const sms_1 = require("../lib/sms");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const OTP_MAX_RETRIES = parseInt(process.env.OTP_MAX_RETRIES || "3", 10);
const OTP_LOCKOUT_HOURS = parseInt(process.env.OTP_LOCKOUT_HOURS || "24", 10);
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || "5", 10);
function formatAuthUserResponse(user, requestedView) {
    const profile = user.customerProfile || user.profile;
    const hasWholesaleAccount = Boolean(profile?.businessName ||
        profile?.customerType === "WHOLESALE" ||
        profile?.wholesaleCustomerId);
    const isWholesaleApproved = hasWholesaleAccount && profile?.approvalStatus === "APPROVED";
    const activeView = requestedView || (isWholesaleApproved ? "WHOLESALE" : "REGULAR");
    const token = (0, jwt_1.signToken)({
        userId: user.id,
        phone: user.phone,
        email: user.email,
        customerType: profile?.customerType,
        wholesaleCustomerId: profile?.wholesaleCustomerId,
        activeView,
    });
    return {
        token,
        user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            profile,
            customerProfile: profile,
            hasWholesaleAccount,
            isWholesaleApproved,
            activeView,
            wholesaleStatus: !hasWholesaleAccount ? "NONE" : profile?.approvalStatus,
            wholesaleCustomerId: profile?.wholesaleCustomerId || null,
        },
    };
}
// ----------------------------------------------------
// 1. Send OTP (Mobile Phone or Wholesale Customer ID)
// ----------------------------------------------------
router.post("/send-otp", async (req, res) => {
    try {
        const { phone: rawPhone, wholesaleCustomerId } = req.body;
        let targetPhone = rawPhone ? String(rawPhone).trim() : undefined;
        // If wholesaleCustomerId provided, find registered user's phone
        if (!targetPhone && wholesaleCustomerId) {
            const profile = await prisma_1.prisma.customerProfile.findUnique({
                where: { wholesaleCustomerId: String(wholesaleCustomerId).trim() },
                include: { user: true },
            });
            if (!profile || !profile.user) {
                return res.status(404).json({
                    success: false,
                    message: "Wholesale Customer ID not found. Please verify your ID.",
                });
            }
            targetPhone = profile.user.phone;
        }
        if (!targetPhone) {
            return res.status(400).json({
                success: false,
                message: "Phone number or Wholesale Customer ID is required",
            });
        }
        const phone = targetPhone;
        // Check if user exists and is locked out
        const user = await prisma_1.prisma.user.findUnique({ where: { phone } });
        if (user && user.lockedUntil && user.lockedUntil > new Date()) {
            const remainingMs = user.lockedUntil.getTime() - Date.now();
            const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
            return res.status(423).json({
                success: false,
                message: `Account is locked due to too many invalid OTP attempts. Please wait ${remainingHours} hour(s) or contact support.`,
                isLocked: true,
            });
        }
        const otpCode = (0, sms_1.generateOtp)();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        // Save OTP session
        await prisma_1.prisma.otpSession.create({
            data: {
                phone,
                otpCode,
                purpose: "LOGIN",
                expiresAt,
            },
        });
        // Dispatch via SMS
        await sms_1.smsService.sendOtp(phone, otpCode);
        // Mask phone number: hide first 5 digits (e.g. 0719876543 -> *****76543)
        const digitsOnly = phone.replace(/\D/g, "");
        const maskedPhone = digitsOnly.length > 5
            ? "*****" + digitsOnly.slice(5)
            : phone.length > 3
                ? "*****" + phone.slice(-3)
                : phone;
        res.json({
            success: true,
            message: `Verification code sent successfully to registered mobile number: ${maskedPhone}`,
            phone,
            maskedPhone,
            // Include code in development mode for easy testing
            debugOtp: process.env.NODE_ENV === "development" ? otpCode : undefined,
        });
    }
    catch (error) {
        console.error("send-otp error:", error);
        res.status(500).json({ success: false, message: "Failed to send verification code" });
    }
});
// ----------------------------------------------------
// Lookup Wholesale Customer info (masked phone with first 5 digits hidden)
// ----------------------------------------------------
router.get("/wholesale-lookup/:wholesaleCustomerId", async (req, res) => {
    try {
        const { wholesaleCustomerId } = req.params;
        if (!wholesaleCustomerId) {
            return res.status(400).json({ success: false, message: "Wholesale Customer ID is required" });
        }
        const profile = await prisma_1.prisma.customerProfile.findUnique({
            where: { wholesaleCustomerId: String(wholesaleCustomerId).trim() },
            include: { user: true },
        });
        if (!profile || !profile.user) {
            return res.status(404).json({
                success: false,
                message: "Wholesale Customer ID not found. Please verify your ID.",
            });
        }
        const phone = profile.user.phone;
        const digitsOnly = phone.replace(/\D/g, "");
        const maskedPhone = digitsOnly.length > 5
            ? "*****" + digitsOnly.slice(5)
            : phone.length > 3
                ? "*****" + phone.slice(-3)
                : phone;
        res.json({
            success: true,
            data: {
                wholesaleCustomerId: profile.wholesaleCustomerId,
                businessName: profile.businessName || profile.user.name,
                maskedPhone,
            },
        });
    }
    catch (error) {
        console.error("wholesale-lookup error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch wholesale customer details" });
    }
});
// ----------------------------------------------------
// 2. Verify OTP & Login
// ----------------------------------------------------
router.post("/verify-otp", async (req, res) => {
    try {
        const { phone, otpCode } = req.body;
        if (!phone || !otpCode) {
            return res.status(400).json({ success: false, message: "Phone and verification code are required" });
        }
        let user = await prisma_1.prisma.user.findUnique({
            where: { phone },
            include: { customerProfile: true, adminUser: true },
        });
        // Check lockout
        if (user && user.lockedUntil && user.lockedUntil > new Date()) {
            return res.status(423).json({
                success: false,
                message: "Account is locked. Please try again later or contact TransAsia admin to reset your lockout.",
                isLocked: true,
            });
        }
        // Find valid OTP
        const validOtp = await prisma_1.prisma.otpSession.findFirst({
            where: {
                phone,
                otpCode,
                isVerified: false,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
        });
        if (!validOtp) {
            // Increment failure count
            if (user) {
                const newCount = user.otpRetryCount + 1;
                let lockedUntil = user.lockedUntil;
                if (newCount >= OTP_MAX_RETRIES) {
                    lockedUntil = new Date(Date.now() + OTP_LOCKOUT_HOURS * 60 * 60 * 1000);
                    console.warn(`[SECURITY] User with phone ${phone} locked out for 24h after ${newCount} failed attempts.`);
                }
                await prisma_1.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        otpRetryCount: newCount,
                        lockedUntil,
                    },
                });
                if (newCount >= OTP_MAX_RETRIES) {
                    return res.status(423).json({
                        success: false,
                        message: `Maximum OTP retry limit exceeded (${OTP_MAX_RETRIES} attempts). Your account is locked for ${OTP_LOCKOUT_HOURS} hours. Contact support to unlock.`,
                        isLocked: true,
                    });
                }
            }
            return res.status(400).json({ success: false, message: "Invalid or expired verification code" });
        }
        // Mark OTP as verified
        await prisma_1.prisma.otpSession.update({
            where: { id: validOtp.id },
            data: { isVerified: true },
        });
        // If user does not exist, create a default Regular customer
        if (!user) {
            user = await prisma_1.prisma.user.create({
                data: {
                    phone,
                    customerProfile: {
                        create: {
                            fullName: "Valued Customer",
                            customerType: "REGULAR",
                            approvalStatus: "APPROVED",
                        },
                    },
                },
                include: { customerProfile: true, adminUser: true },
            });
        }
        else {
            // Reset retry count upon successful verification
            await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { otpRetryCount: 0, lockedUntil: null },
            });
        }
        const authData = formatAuthUserResponse(user);
        res.json({
            success: true,
            ...authData,
        });
    }
    catch (error) {
        console.error("verify-otp error:", error);
        res.status(500).json({ success: false, message: "Verification failed" });
    }
});
// ----------------------------------------------------
// 3. Register Regular Customer (FR-01, FR-02)
// ----------------------------------------------------
router.post("/register-regular", async (req, res) => {
    try {
        const { fullName, phone, email, password, address, cityId, districtId } = req.body;
        if (!fullName || !phone) {
            return res.status(400).json({ success: false, message: "Name and phone are mandatory" });
        }
        const existingUser = await prisma_1.prisma.user.findUnique({ where: { phone } });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "An account with this phone number already exists" });
        }
        let passwordHash = undefined;
        if (password) {
            passwordHash = await bcryptjs_1.default.hash(password, 10);
        }
        const user = await prisma_1.prisma.user.create({
            data: {
                phone,
                email: email || null,
                passwordHash,
                customerProfile: {
                    create: {
                        fullName,
                        customerType: "REGULAR",
                        approvalStatus: "APPROVED",
                        addresses: address && cityId && districtId ? {
                            create: {
                                addressLine: address,
                                cityId,
                                districtId,
                                isDefault: true,
                            },
                        } : undefined,
                    },
                },
            },
            include: { customerProfile: true },
        });
        const authData = formatAuthUserResponse(user);
        res.status(201).json({
            success: true,
            message: "Account registered successfully",
            ...authData,
        });
    }
    catch (error) {
        console.error("register-regular error:", error);
        res.status(500).json({ success: false, message: "Registration failed" });
    }
});
// ----------------------------------------------------
// 4. Register Wholesale Customer (FR-01, FR-03)
// ----------------------------------------------------
router.post("/register-wholesale", async (req, res) => {
    try {
        const { fullName, phone, email, password, businessName, businessAddress, ownerName, brcDocumentUrl, } = req.body;
        if (!fullName || !phone || !businessName || !businessAddress) {
            return res.status(400).json({
                success: false,
                message: "Full name, phone, business name, and business address are required for wholesale registration",
            });
        }
        const existingUser = await prisma_1.prisma.user.findUnique({
            where: { phone },
            include: { customerProfile: true },
        });
        if (existingUser) {
            // If user already exists, verify password if provided, or allow upgrading their profile
            if (password && existingUser.passwordHash) {
                const isMatch = await bcryptjs_1.default.compare(password, existingUser.passwordHash);
                if (isMatch) {
                    const updatedProfile = await prisma_1.prisma.customerProfile.update({
                        where: { userId: existingUser.id },
                        data: {
                            customerType: "WHOLESALE",
                            businessName,
                            businessAddress,
                            ownerName: ownerName || fullName,
                            brcDocumentUrl: brcDocumentUrl || null,
                            approvalStatus: "PENDING",
                        },
                    });
                    const authData = formatAuthUserResponse({ ...existingUser, customerProfile: updatedProfile });
                    return res.status(200).json({
                        success: true,
                        message: "Wholesale application submitted for your account. Pricing will update upon approval.",
                        ...authData,
                    });
                }
            }
            return res.status(409).json({
                success: false,
                message: "An account with this phone number already exists. Please log in first or enter your correct password to submit your wholesale application.",
            });
        }
        let passwordHash = undefined;
        if (password) {
            passwordHash = await bcryptjs_1.default.hash(password, 10);
        }
        const user = await prisma_1.prisma.user.create({
            data: {
                phone,
                email: email || null,
                passwordHash,
                customerProfile: {
                    create: {
                        fullName,
                        customerType: "WHOLESALE",
                        approvalStatus: "PENDING", // Pre-approval: sees retail prices until approved
                        businessName,
                        businessAddress,
                        ownerName: ownerName || fullName,
                        brcDocumentUrl: brcDocumentUrl || null,
                    },
                },
            },
            include: { customerProfile: true },
        });
        const authData = formatAuthUserResponse(user);
        res.status(201).json({
            success: true,
            message: "Wholesale application submitted successfully. Pricing will update upon approval.",
            ...authData,
        });
    }
    catch (error) {
        console.error("register-wholesale error:", error);
        res.status(500).json({ success: false, message: "Wholesale registration failed" });
    }
});
// ----------------------------------------------------
// 5. Password Login (Customer) (FR-05)
// ----------------------------------------------------
router.post("/login-password", async (req, res) => {
    try {
        const { identifier, password } = req.body; // identifier can be phone or email
        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: "Identifier and password are required" });
        }
        const user = await prisma_1.prisma.user.findFirst({
            where: {
                OR: [{ phone: identifier }, { email: identifier }],
            },
            include: { customerProfile: true },
        });
        if (!user || !user.passwordHash) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const authData = formatAuthUserResponse(user);
        res.json({
            success: true,
            ...authData,
        });
    }
    catch (error) {
        console.error("login-password error:", error);
        res.status(500).json({ success: false, message: "Login failed" });
    }
});
// ----------------------------------------------------
// 6. Wholesale Login via Wholesale Customer ID (FR-06)
// ----------------------------------------------------
router.post("/login-wholesale", async (req, res) => {
    try {
        const { wholesaleCustomerId, password, otpCode } = req.body;
        if (!wholesaleCustomerId) {
            return res.status(400).json({ success: false, message: "Wholesale Customer ID is required" });
        }
        const profile = await prisma_1.prisma.customerProfile.findUnique({
            where: { wholesaleCustomerId },
            include: { user: true },
        });
        if (!profile || !profile.user) {
            return res.status(404).json({ success: false, message: "Wholesale Customer ID not found" });
        }
        // Password path
        if (password && profile.user.passwordHash) {
            const isMatch = await bcryptjs_1.default.compare(password, profile.user.passwordHash);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: "Invalid password" });
            }
        }
        else if (otpCode) {
            // OTP path
            const validOtp = await prisma_1.prisma.otpSession.findFirst({
                where: {
                    phone: profile.user.phone,
                    otpCode,
                    isVerified: false,
                    expiresAt: { gt: new Date() },
                },
            });
            if (!validOtp) {
                return res.status(400).json({ success: false, message: "Invalid or expired OTP code" });
            }
            await prisma_1.prisma.otpSession.update({ where: { id: validOtp.id }, data: { isVerified: true } });
        }
        else {
            return res.status(400).json({ success: false, message: "Password or verification code is required" });
        }
        const authData = formatAuthUserResponse({ ...profile.user, customerProfile: profile }, "WHOLESALE");
        res.json({
            success: true,
            ...authData,
        });
    }
    catch (error) {
        console.error("login-wholesale error:", error);
        res.status(500).json({ success: false, message: "Wholesale login failed" });
    }
});
// ----------------------------------------------------
// 7. Apply for Wholesale Status (Logged-in Customer)
// ----------------------------------------------------
router.post("/apply-wholesale", auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { businessName, businessAddress, ownerName, brcDocumentUrl } = req.body;
        if (!businessName || !businessAddress) {
            return res.status(400).json({
                success: false,
                message: "Business name and business address are required for wholesale registration",
            });
        }
        const updated = await prisma_1.prisma.customerProfile.update({
            where: { userId: req.user.userId },
            data: {
                customerType: "WHOLESALE",
                businessName,
                businessAddress,
                ownerName: ownerName || undefined,
                brcDocumentUrl: brcDocumentUrl || null,
                approvalStatus: "PENDING",
            },
            include: { user: true },
        });
        const authData = formatAuthUserResponse({ ...updated.user, customerProfile: updated });
        res.json({
            success: true,
            message: "Wholesale application submitted successfully. Pricing will update upon approval.",
            ...authData,
        });
    }
    catch (error) {
        console.error("apply-wholesale error:", error);
        res.status(500).json({ success: false, message: "Failed to submit wholesale application" });
    }
});
// ----------------------------------------------------
// 8. Switch Customer View Mode (FR-07, FR-08, Switching)
// ----------------------------------------------------
router.post("/switch-view-mode", auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { viewMode } = req.body;
        if (viewMode !== "REGULAR" && viewMode !== "WHOLESALE") {
            return res.status(400).json({
                success: false,
                message: "Invalid viewMode. Must be 'REGULAR' or 'WHOLESALE'.",
            });
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.userId },
            include: { customerProfile: true },
        });
        if (!user || !user.customerProfile) {
            return res.status(404).json({ success: false, message: "User profile not found" });
        }
        const profile = user.customerProfile;
        const hasWholesaleAccount = Boolean(profile.businessName ||
            profile.customerType === "WHOLESALE" ||
            profile.wholesaleCustomerId);
        if (viewMode === "WHOLESALE") {
            if (!hasWholesaleAccount) {
                return res.status(403).json({
                    success: false,
                    code: "NOT_REGISTERED",
                    message: "You are not registered with a wholesale account. Please register as a wholesale customer first.",
                });
            }
            if (profile.approvalStatus === "PENDING") {
                return res.status(403).json({
                    success: false,
                    code: "PENDING_APPROVAL",
                    message: `Your wholesale application for "${profile.businessName || "your business"}" is currently pending verification. Wholesale prices will be available once approved.`,
                });
            }
            if (profile.approvalStatus === "REJECTED") {
                return res.status(403).json({
                    success: false,
                    code: "REJECTED",
                    message: "Your wholesale application was not approved. Please contact TransAsia support for assistance.",
                });
            }
            if (profile.approvalStatus !== "APPROVED") {
                return res.status(403).json({
                    success: false,
                    code: "NOT_APPROVED",
                    message: "Wholesale account is not approved.",
                });
            }
        }
        const authData = formatAuthUserResponse(user, viewMode);
        res.json({
            success: true,
            message: viewMode === "WHOLESALE" ? "Switched to Wholesale view" : "Switched to Retail view",
            ...authData,
        });
    }
    catch (error) {
        console.error("switch-view-mode error:", error);
        res.status(500).json({ success: false, message: "Failed to switch customer view mode" });
    }
});
// ----------------------------------------------------
// 9. Get Current User Profile (Me)
// ----------------------------------------------------
router.get("/me", auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.userId },
            include: {
                customerProfile: {
                    include: {
                        addresses: {
                            include: { city: true, district: true },
                        },
                    },
                },
                adminUser: true,
            },
        });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const authData = formatAuthUserResponse(user, req.user?.activeView);
        res.json({
            success: true,
            ...authData,
            adminUser: user.adminUser,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: "Failed to retrieve profile" });
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map