const API_URL = "http://localhost:5000/api/admin";

async function main() {
  console.log("=== TRANSASIA ADMIN USER & CUSTOMER MANAGEMENT TEST ===\n");

  // 1. Fetch initial customer stats
  console.log("Step 1: Fetching customer statistics...");
  const statsRes = await fetch(`${API_URL}/customers/stats`);
  const statsData = await statsRes.json();
  console.log("✓ Initial Stats:", statsData.stats);

  // 2. Fetch all customers
  console.log("\nStep 2: Listing all customers...");
  const custRes = await fetch(`${API_URL}/customers`);
  const custData = await custRes.json();
  console.log(`✓ Fetched ${custData.data?.length} customers.`);

  // 3. Find a pending wholesale applicant
  const pendingCustomer = custData.data?.find(c => c.customerType === "WHOLESALE" && c.approvalStatus === "PENDING");
  if (pendingCustomer) {
    console.log(`\nStep 3: Approving Pending Wholesale Customer: ${pendingCustomer.fullName} (${pendingCustomer.phone})...`);
    const approveRes = await fetch(`${API_URL}/wholesale-applications/${pendingCustomer.id}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wholesaleCustomerId: "WS-10099" })
    });
    const approveData = await approveRes.json();
    console.log("✓ Approved result:", approveData.data?.wholesaleCustomerId, "Status:", approveData.data?.approvalStatus);
    if (approveData.data?.wholesaleCustomerId !== "WS-10099" || approveData.data?.approvalStatus !== "APPROVED") {
      throw new Error("Approval failed to assign WS-10099!");
    }
  } else {
    console.log("\nStep 3: No pending wholesale customer found to approve.");
  }

  // 4. Test Lockout Reset
  console.log("\nStep 4: Testing Lockout Reset on customer...");
  const firstCustomer = custData.data?.[0];
  const lockoutRes = await fetch(`${API_URL}/customers/${firstCustomer.id}/reset-lockout`, {
    method: "POST"
  });
  const lockoutData = await lockoutRes.json();
  console.log("✓ Lockout reset message:", lockoutData.message);

  // 5. Test Admin Creating New Customer
  console.log("\nStep 5: Admin Creating New Wholesale Partner...");
  const testPhone = "07111" + Math.floor(10000 + Math.random() * 90000);
  const createRes = await fetch(`${API_URL}/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Kandy Tech Hub Pvt Ltd",
      phone: testPhone,
      email: "kandytech@example.com",
      customerType: "WHOLESALE",
      businessName: "Kandy Tech Hub",
      businessAddress: "45 Dalada Veediya, Kandy",
      wholesaleCustomerId: "WS-10077"
    })
  });
  const createData = await createRes.json();
  console.log("✓ Created customer:", createData.data?.fullName, "WS ID:", createData.data?.wholesaleCustomerId);
  if (!createData.success || createData.data?.wholesaleCustomerId !== "WS-10077") {
    throw new Error("Failed to create customer!");
  }

  // 6. Verify Updated Stats
  console.log("\nStep 6: Verifying updated customer stats...");
  const updatedStatsRes = await fetch(`${API_URL}/customers/stats`);
  const updatedStats = await updatedStatsRes.json();
  console.log("✓ Updated Stats:", updatedStats.stats);

  console.log("\n==========================================");
  console.log("🎉 ALL ADMIN CUSTOMER MANAGEMENT TESTS PASSED!");
  console.log("==========================================");
}

main().catch(err => {
  console.error("❌ ADMIN TEST FAILED:", err);
  process.exit(1);
});
