export interface ISmsService {
  sendOtp(phone: string, otpCode: string): Promise<boolean>;
}

class MockSmsService implements ISmsService {
  async sendOtp(phone: string, otpCode: string): Promise<boolean> {
    console.log(`\n========================================`);
    console.log(`[SMS OTP MOCK GATEWAY]`);
    console.log(`To Phone Number: ${phone}`);
    console.log(`Your TransAsia Verification Code: ${otpCode}`);
    console.log(`Valid for 5 minutes. Do not share with anyone.`);
    console.log(`========================================\n`);
    return true;
  }
}

export const smsService: ISmsService = new MockSmsService();

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
