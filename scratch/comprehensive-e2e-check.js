const API_URL = "http://localhost:5000/api";

async function main() {
  console.log("=== TRANSASIA WHOLESALE / RETAIL E2E VERIFICATION ===\n");

  // 1. Wholesale Customer Login (WS-10025)
  console.log("Step 1: Logging in as approved Wholesale Customer (WS-10025)...");
  const wsLoginRes = await fetch(`${API_URL}/auth/login-wholesale`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wholesaleCustomerId: "WS-10025",
      password: "wholesale123",
    }),
  });
  const wsLoginData = await wsLoginRes.json();
  if (!wsLoginData.success) {
    throw new Error(`Wholesale login failed: ${JSON.stringify(wsLoginData)}`);
  }
  const wsToken = wsLoginData.token;
  console.log("✓ Wholesale login successful.");
  console.log("  Active View:", wsLoginData.user?.activeView);
  console.log("  Is Approved Wholesale:", wsLoginData.user?.isWholesaleApproved);
  console.log("  Wholesale Customer ID:", wsLoginData.user?.wholesaleCustomerId);

  // 2. Fetch Products in Wholesale View
  console.log("\nStep 2: Fetching products in Wholesale View...");
  const wsProductRes = await fetch(`${API_URL}/products/samsung-galaxy-s24-ultra-512gb`, {
    headers: {
      Authorization: `Bearer ${wsToken}`,
      "x-customer-view": "WHOLESALE",
    },
  });
  const wsProductJson = await wsProductRes.json();
  const wsProduct = wsProductJson.data;
  console.log("✓ Product retrieved in Wholesale View:");
  if (wsProduct) {
    console.log(`  Product: ${wsProduct.title}`);
    console.log(`  Effective Price: Rs. ${wsProduct.price.toLocaleString()}`);
    console.log(`  Wholesale Pricing Applied: ${wsProduct.isWholesalePricingApplied}`);
    if (!wsProduct.isWholesalePricingApplied || wsProduct.price !== 365000) {
      throw new Error("Expected wholesale price 365,000 with wholesale pricing flag!");
    }
  }

  // 3. Switch Wholesale Customer to Retail View
  console.log("\nStep 3: Switching Wholesale Customer to Retail View...");
  const switchRes = await fetch(`${API_URL}/auth/switch-view-mode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${wsToken}`,
    },
    body: JSON.stringify({ viewMode: "REGULAR" }),
  });
  const switchData = await switchRes.json();
  if (!switchData.success) {
    throw new Error(`Switch to regular view failed: ${JSON.stringify(switchData)}`);
  }
  const regularToken = switchData.token;
  console.log("✓ Switched view to:", switchData.user?.activeView);

  // 4. Fetch Products after switching to Retail View
  console.log("\nStep 4: Fetching products in Retail View (same wholesale customer)...");
  const regularProductRes = await fetch(`${API_URL}/products/samsung-galaxy-s24-ultra-512gb`, {
    headers: {
      Authorization: `Bearer ${regularToken}`,
      "x-customer-view": "REGULAR",
    },
  });
  const regularProductJson = await regularProductRes.json();
  const regProduct = regularProductJson.data;
  console.log("✓ Product retrieved in Retail View:");
  if (regProduct) {
    console.log(`  Product: ${regProduct.title}`);
    console.log(`  Effective Price: Rs. ${regProduct.price.toLocaleString()}`);
    console.log(`  Wholesale Pricing Applied: ${regProduct.isWholesalePricingApplied}`);
    if (regProduct.isWholesalePricingApplied || regProduct.price !== 399000) {
      throw new Error("Expected standard retail price 399,000 without wholesale pricing flag!");
    }
  }

  // 5. Retail Customer Security Check
  console.log("\nStep 5: Retail Customer cannot switch to Wholesale View without registered account...");
  const testPhone = "07700" + Math.floor(10000 + Math.random() * 90000);
  const otpRes = await fetch(`${API_URL}/auth/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: testPhone }),
  });
  const otpData = await otpRes.json();
  const verifyRes = await fetch(`${API_URL}/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: testPhone, otpCode: otpData.debugOtp }),
  });
  const regUser = await verifyRes.json();
  const regToken = regUser.token;

  const unauthorizedSwitch = await fetch(`${API_URL}/auth/switch-view-mode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${regToken}`,
    },
    body: JSON.stringify({ viewMode: "WHOLESALE" }),
  });
  const unauthData = await unauthorizedSwitch.json();
  console.log(`✓ Unauthorized switch rejected with status: ${unauthorizedSwitch.status} (Code: ${unauthData.code})`);
  if (unauthorizedSwitch.status !== 403 || unauthData.code !== "NOT_REGISTERED") {
    throw new Error("Expected 403 NOT_REGISTERED for retail user!");
  }

  // 6. Retail Customer Applies for Wholesale Account
  console.log("\nStep 6: Retail Customer submits Wholesale Application...");
  const applyRes = await fetch(`${API_URL}/auth/apply-wholesale`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${regToken}`,
    },
    body: JSON.stringify({
      businessName: "Colombo Tech Traders Ltd",
      businessAddress: "123 Galle Road, Colombo 03",
      contactPerson: "Retail Tester",
      brcNumber: "PV-999888",
    }),
  });
  const applyData = await applyRes.json();
  console.log("✓ Application submitted. Status:", applyData.user?.wholesaleStatus);

  // 7. Pending Customer Attempting to Switch to Wholesale View
  console.log("\nStep 7: Pending Customer attempting to switch to Wholesale View...");
  const pendingSwitch = await fetch(`${API_URL}/auth/switch-view-mode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${applyData.token}`,
    },
    body: JSON.stringify({ viewMode: "WHOLESALE" }),
  });
  const pendingData = await pendingSwitch.json();
  console.log(`✓ Pending switch blocked with status: ${pendingSwitch.status} (Code: ${pendingData.code})`);
  if (pendingSwitch.status !== 403 || pendingData.code !== "PENDING_APPROVAL") {
    throw new Error("Expected 403 PENDING_APPROVAL for pending applicant!");
  }

  // 8. Anonymous Guest Customer checks
  console.log("\nStep 8: Anonymous Guest checking products with spoofed wholesale header...");
  const guestRes = await fetch(`${API_URL}/products/samsung-galaxy-s24-ultra-512gb`, {
    headers: {
      "x-customer-view": "WHOLESALE",
    },
  });
  const guestJson = await guestRes.json();
  const guestProduct = guestJson.data;
  console.log("✓ Guest Product Price:", guestProduct?.price, "- Wholesale Applied:", guestProduct?.isWholesalePricingApplied);
  if (guestProduct?.isWholesalePricingApplied || guestProduct?.price !== 399000) {
    throw new Error("Guest must never see wholesale pricing!");
  }

  console.log("\n==========================================");
  console.log("🎉 ALL E2E VERIFICATION TESTS PASSED!");
  console.log("==========================================");
}

main().catch(err => {
  console.error("❌ E2E VERIFICATION FAILED:", err);
  process.exit(1);
});
