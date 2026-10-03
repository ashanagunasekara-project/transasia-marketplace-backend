import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "transasia_super_secret_jwt_key_2026_default";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export interface TokenPayload {
  userId: string;
  phone?: string;
  email?: string | null;
  role?: string;
  customerType?: string;
  wholesaleCustomerId?: string | null;
  activeView?: "REGULAR" | "WHOLESALE";
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
