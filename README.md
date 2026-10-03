# TransAsia E-Commerce Backend API (`@service/backend`)

Dedicated Node.js, Express, and Prisma backend service powering both `@service/main` (Customer Storefront) and `@service/admin` (Backoffice Dashboard).

---

## 1. Developed Functions & Capabilities

### 1.1 Authentication & Security (`/api/auth`)
- **SMS OTP Authentication (FR-04)**: Phone number login via 6-digit SMS OTP (mock provider active in development, logs code to console).
- **OTP Security Rules (FR-42, FR-43)**:
  - Default maximum of **3 retry attempts** (configurable).
  - Exceeding retry limit triggers a **24-hour account lockout**.
  - Lockout status and remaining time communicated in API responses.
- **Password Authentication Fallback (FR-05)**: Traditional email/phone + bcrypt password login.
- **Customer Registrations (FR-01, FR-02, FR-03)**:
  - **Regular Customer**: Name, phone, mandatory delivery address; email optional.
  - **Wholesale Customer**: Additional business name, business address, owner name, and BRC upload support.
- **Wholesale Login via Wholesale Customer ID (FR-06)**: Login using POS-assigned ID (`WS-XXXXX`) + phone/OTP or password.
- **JWT Session Issuance**: Signed JWT containing `userId`, `customerType`, `wholesaleCustomerId`, and `role`.

### 1.2 Catalog & Business Rules (`/api/products`, `/api/categories`, `/api/brands`)
- **Stock Display Rules (FR-27, FR-28)**:
  - Stock ≤ 20: Returns exact count and label (e.g. `14 Available`).
  - Stock ≥ 21: Visual count capped to 20 with label `"20+ Qty Available"`.
- **Wholesale Pricing Gate (FR-07, FR-08)**:
  - Unapproved or guest users see standard **retail prices**.
  - Approved wholesale customers (`approvalStatus === 'APPROVED'`) see discounted **wholesale prices**.
- **Filtering & Search**: Category slug, brand slug, keyword search, min/max price range, sorting, and pagination.

### 1.3 Orders & Checkout (`/api/orders`)
- **Quantity Cap Rule (FR-29)**: Max **20 units of one item per order**; requests with 21+ are rejected with a clear error message.
- **Cash on Delivery Toggle (FR-23, FR-35)**: COD is disabled by default; order placement validates against `store_settings.cod_enabled`.
- **Bank Transfer Deposit Slip Upload (FR-33)**: Multipart image/PDF upload (`/api/orders/:id/bank-slip`) linked to order payment record.
- **Order Numbering**: Sequential human-readable format (e.g. `TA-2026-00001`).
- **Customer Order Tracking**: Query order status by order number (`/api/orders/track/:orderNumber`).

### 1.4 Sri Lanka Address Selector (`/api/locations`)
- **25 Districts Provider (FR-31)**: All Sri Lanka administrative districts.
- **City Disambiguation (FR-32)**: City listings linked to district with formatted display name (e.g. `Kochchikade (Colombo)` vs. `Kochchikade (Gampaha)`).

### 1.5 Admin Backoffice Operations (`/api/admin`)
- **Order Management**: Filter by status, update state transitions (`PENDING` -> `CONFIRMED` -> `DISPATCHED` -> `DELIVERED` -> `CANCELLED`), assign courier tracking number.
- **Wholesale Verification Workflow (FR-09, FR-10)**: Inspect pending BRC applications, Approve (assigning POS Wholesale ID) or Reject.
- **Manual OTP Lockout Reset (FR-22, FR-44)**: Admin action to clear 24h lockout for a customer immediately.
- **Cash on Delivery Admin Toggle (FR-23)**: Enable or disable COD store-wide.
- **View-Only Catalog Access (FR-21)**: Catalog response flagged with `isViewOnly: true` as POS owns product data.
- **Dashboard Metrics**: Summary cards (Total Orders, Pending Orders, Revenue, Pending Wholesale applications).

---

## 2. Testing Guide & Test Scenarios

Run these tests in PowerShell or terminal using `curl` or `Invoke-RestMethod` while the backend is running at `http://localhost:5000`.

### Test 1: Mobile OTP Login & Lockout Enforcement (FR-04, FR-42, FR-43)

1. **Request an OTP**:
   ```powershell
   curl -X POST http://localhost:5000/api/auth/send-otp `
     -H "Content-Type: application/json" `
     -d '{"phone": "0773392727"}'
   ```
   *Expected Response:* `{"success": true, "message": "Verification code sent...", "debugOtp": "XXXXXX"}`. Notice the code logged in backend console.

2. **Submit Incorrect OTP 3 Times (Trigger Lockout)**:
   ```powershell
   curl -X POST http://localhost:5000/api/auth/verify-otp `
     -H "Content-Type: application/json" `
     -d '{"phone": "0773392727", "otpCode": "000000"}'
   ```
   *Expected Result on 3rd attempt:* HTTP 423 Locked with message: `"Maximum OTP retry limit exceeded (3 attempts). Your account is locked for 24 hours."`

3. **Verify with Valid OTP**:
   ```powershell
   curl -X POST http://localhost:5000/api/auth/verify-otp `
     -H "Content-Type: application/json" `
     -d '{"phone": "0773392727", "otpCode": "<DEBUG_OTP>"}'
   ```
   *Expected Response:* JWT `token` and user profile returned.

---

### Test 2: Stock Display Threshold Rule (FR-27, FR-28)

Fetch all products:
```powershell
curl http://localhost:5000/api/products
```
*Verification Check:*
- Look for **iPhone 15 Pro Max** (has 45 in DB): `stockQuantity` is capped to `20`, and `stockLabel` is `"20+ Qty Available"`.
- Look for **Sony Headphones** (has 14 in DB): `stockQuantity` is `14`, and `stockLabel` is `"14 Available"`.

---

### Test 3: Wholesale Pricing Visibility (FR-07, FR-08)

1. **As Guest or Regular Customer**:
   ```powershell
   curl http://localhost:5000/api/products/iphone-15-pro-max-256gb
   ```
   *Expected Result:* `price` = `425000` (Retail price), `isWholesalePricingApplied` = `false`.

2. **As Approved Wholesale Customer** (using seeded token):
   ```powershell
   # Login as seeded wholesale customer
   $res = curl -s -X POST http://localhost:5000/api/auth/login-password `
     -H "Content-Type: application/json" `
     -d '{"identifier": "0719876543", "password": "wholesale123"}' | ConvertFrom-Json

   $token = $res.token

   # Query product with wholesale token
   curl http://localhost:5000/api/products/iphone-15-pro-max-256gb `
     -H "Authorization: Bearer $token"
   ```
   *Expected Result:* `price` = `395000` (Wholesale price), `isWholesalePricingApplied` = `true`.

---

### Test 4: Quantity Cap Rule (FR-29) - Maximum 20 Units

Attempt to order 25 units of an item:
```powershell
curl -X POST http://localhost:5000/api/orders `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer <TOKEN>" `
  -d '{
    "items": [{"productId": "<PRODUCT_ID>", "title": "Apple iPhone 15 Pro", "quantity": 25}],
    "deliveryMethod": "DOMEX_COURIER",
    "shippingAddress": {"city": "Colombo"},
    "paymentMethod": "BANK_TRANSFER"
  }'
```
*Expected Result:* HTTP 400 Bad Request with message:
`"Maximum quantity exceeded for item: ... You can purchase a maximum of 20 units of one item per order."`

---

### Test 5: Cash on Delivery Toggle Enforcement (FR-23, FR-35)

1. **Attempt COD Order when Disabled (Default)**:
   ```powershell
   curl -X POST http://localhost:5000/api/orders `
     -H "Content-Type: application/json" `
     -H "Authorization: Bearer <TOKEN>" `
     -d '{
       "items": [{"productId": "<PRODUCT_ID>", "title": "Item", "quantity": 2}],
       "deliveryMethod": "DOMEX_COURIER",
       "shippingAddress": {"city": "Colombo"},
       "paymentMethod": "CASH_ON_DELIVERY"
     }'
   ```
   *Expected Result:* HTTP 400 Bad Request: `"Cash on Delivery is currently disabled by store administration."`

2. **Enable COD via Admin and Retry**:
   ```powershell
   # 1. Login as Super Admin
   $adminRes = curl -s -X POST http://localhost:5000/api/admin/login `
     -H "Content-Type: application/json" `
     -d '{"username": "admin", "password": "admin123"}' | ConvertFrom-Json
   $adminToken = $adminRes.token

   # 2. Toggle COD to true
   curl -X POST http://localhost:5000/api/admin/settings/toggle-cod `
     -H "Content-Type: application/json" `
     -H "Authorization: Bearer $adminToken" `
     -d '{"enabled": true}'
   ```
   *Expected Result:* `"Cash on Delivery has been enabled."`

---

### Test 6: Admin Manual OTP Lockout Reset (FR-22, FR-44)

When a customer gets locked out after 3 failed OTP attempts:
```powershell
curl -X POST http://localhost:5000/api/admin/customers/<CUSTOMER_USER_ID>/reset-lockout `
  -H "Authorization: Bearer $adminToken"
```
*Expected Result:* HTTP 200 OK: `"OTP lockout successfully cleared for user 0773392727. Customer can now log in immediately."`

---

### Test 7: Sri Lanka 25 Districts & City Disambiguation (FR-31, FR-32)

1. **Get 25 Districts**:
   ```powershell
   curl http://localhost:5000/api/locations/districts
   ```
   *Expected Result:* Array of districts (Colombo, Gampaha, Kurunegala, Kandy, Galle, Kalutara, etc.).

2. **Search Duplicate City Name "Kochchikade"**:
   ```powershell
   curl "http://localhost:5000/api/locations/cities?search=Kochchikade"
   ```
   *Expected Result:* Returns both disambiguated records:
   - `Kochchikade (Colombo)` - Postal Code 01300
   - `Kochchikade (Gampaha)` - Postal Code 11540

---

## 3. Seeded Accounts Reference

| Role | Identifier | Password | Access |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin` | `admin123` | Full backoffice access at `http://localhost:4000` |
| **Regular Customer** | `0773392727` | SMS OTP | Standard storefront shopping |
| **Wholesale Customer** | `0719876543` / `WS-10025` | `wholesale123` | Approved wholesale pricing tier |
