"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsService = void 0;
exports.generateOtp = generateOtp;
class MockSmsService {
    async sendOtp(phone, otpCode) {
        console.log(`\n========================================`);
        console.log(`[SMS OTP MOCK GATEWAY]`);
        console.log(`To Phone Number: ${phone}`);
        console.log(`Your TransAsia Verification Code: ${otpCode}`);
        console.log(`Valid for 5 minutes. Do not share with anyone.`);
        console.log(`========================================\n`);
        return true;
    }
}
exports.smsService = new MockSmsService();
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
//# sourceMappingURL=sms.js.map