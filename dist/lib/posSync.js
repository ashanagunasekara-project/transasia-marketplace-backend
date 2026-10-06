"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushPendingWholesaleRegistrations = pushPendingWholesaleRegistrations;
exports.pullApprovedWholesaleFromPOS = pullApprovedWholesaleFromPOS;
exports.runPosWholesaleSync = runPosWholesaleSync;
exports.startPosSyncCron = startPosSyncCron;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = require("./prisma");
const posDb_1 = require("./posDb");
let isSyncRunning = false;
/**
 * Pushes pending wholesale registrations from our PostgreSQL database
 * to the POS MSSQL database (web_wholesale_registrations table).
 */
async function pushPendingWholesaleRegistrations() {
    const errors = [];
    let pushedCount = 0;
    try {
        // 1. Fetch pending wholesale profiles from our PostgreSQL DB
        const pendingProfiles = await prisma_1.prisma.customerProfile.findMany({
            where: {
                customerType: 'WHOLESALE',
                approvalStatus: 'PENDING',
                wholesaleCustomerId: null,
            },
            include: {
                user: {
                    select: {
                        phone: true,
                        email: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        if (pendingProfiles.length === 0) {
            return { pushedCount: 0, errors: [] };
        }
        const pool = await (0, posDb_1.getPosDb)();
        for (const profile of pendingProfiles) {
            try {
                const request = pool.request();
                request.input('web_profile_id', posDb_1.sql.NVarChar(100), profile.id);
                request.input('full_name', posDb_1.sql.NVarChar(200), profile.fullName || 'Valued Wholesaler');
                request.input('business_name', posDb_1.sql.NVarChar(200), profile.businessName || profile.fullName || 'N/A');
                request.input('business_address', posDb_1.sql.NVarChar(500), profile.businessAddress || 'N/A');
                request.input('owner_name', posDb_1.sql.NVarChar(200), profile.ownerName || profile.fullName || null);
                request.input('phone', posDb_1.sql.NVarChar(30), profile.user?.phone || '');
                request.input('email', posDb_1.sql.NVarChar(150), profile.user?.email || null);
                request.input('brc_document_url', posDb_1.sql.NVarChar(500), profile.brcDocumentUrl || null);
                request.input('submitted_at', posDb_1.sql.DateTime, profile.createdAt);
                const result = await request.query(`
          IF NOT EXISTS (SELECT 1 FROM web_wholesale_registrations WHERE web_profile_id = @web_profile_id)
          BEGIN
            INSERT INTO web_wholesale_registrations (
              web_profile_id,
              full_name,
              business_name,
              business_address,
              owner_name,
              phone,
              email,
              brc_document_url,
              status,
              submitted_at,
              synced_back
            ) VALUES (
              @web_profile_id,
              @full_name,
              @business_name,
              @business_address,
              @owner_name,
              @phone,
              @email,
              @brc_document_url,
              'PENDING',
              @submitted_at,
              0
            );
            SELECT 1 as inserted;
          END
          ELSE
          BEGIN
            SELECT 0 as inserted;
          END
        `);
                if (result.recordset && result.recordset[0]?.inserted === 1) {
                    pushedCount++;
                    console.log(`[POS SYNC] Pushed wholesale customer ${profile.fullName} (${profile.id}) to POS DB`);
                }
            }
            catch (err) {
                console.error(`[POS SYNC] Error pushing profile ${profile.id}:`, err.message);
                errors.push({ profileId: profile.id, error: err.message });
            }
        }
        if (pushedCount > 0) {
            await prisma_1.prisma.posSyncLog.create({
                data: {
                    direction: 'OUTBOUND_PUSH',
                    entityType: 'WHOLESALE_CUSTOMER',
                    status: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
                    payload: { pushedCount, totalPending: pendingProfiles.length, errors },
                },
            });
        }
        return { pushedCount, errors };
    }
    catch (err) {
        console.error('[POS SYNC] pushPendingWholesaleRegistrations failed:', err.message);
        await prisma_1.prisma.posSyncLog.create({
            data: {
                direction: 'OUTBOUND_PUSH',
                entityType: 'WHOLESALE_CUSTOMER',
                status: 'ERROR',
                errorMessage: err.message,
            },
        }).catch(() => { });
        return { pushedCount, errors: [{ error: err.message }] };
    }
}
/**
 * Pulls approved/rejected wholesale records from POS MSSQL database
 * back into our PostgreSQL database, updating approvalStatus and wholesaleCustomerId.
 */
async function pullApprovedWholesaleFromPOS() {
    const errors = [];
    let approvedCount = 0;
    let rejectedCount = 0;
    try {
        const pool = await (0, posDb_1.getPosDb)();
        // Query POS table for reviewed registrations that haven't been synced back yet
        const result = await pool.request().query(`
      SELECT 
        id,
        web_profile_id,
        status,
        wholesale_customer_id,
        rejection_reason,
        reviewed_at,
        reviewed_by
      FROM web_wholesale_registrations
      WHERE status IN ('APPROVED', 'REJECTED')
        AND synced_back = 0
    `);
        const records = result.recordset || [];
        if (records.length === 0) {
            return { approvedCount: 0, rejectedCount: 0, errors: [] };
        }
        for (const row of records) {
            try {
                const { id: posRecordId, web_profile_id, status, wholesale_customer_id } = row;
                const profile = await prisma_1.prisma.customerProfile.findUnique({
                    where: { id: web_profile_id },
                });
                if (!profile) {
                    console.warn(`[POS SYNC] CustomerProfile ${web_profile_id} not found in PostgreSQL. Skipping.`);
                    continue;
                }
                if (status === 'APPROVED') {
                    const assignedId = wholesale_customer_id?.trim() || `WS-${Math.floor(10000 + Math.random() * 90000)}`;
                    // Check if another profile already has this wholesaleCustomerId
                    const existingWithId = await prisma_1.prisma.customerProfile.findUnique({
                        where: { wholesaleCustomerId: assignedId },
                    });
                    if (existingWithId && existingWithId.id !== web_profile_id) {
                        throw new Error(`Wholesale Customer ID "${assignedId}" is already assigned to ${existingWithId.fullName} (${existingWithId.id})`);
                    }
                    await prisma_1.prisma.customerProfile.update({
                        where: { id: web_profile_id },
                        data: {
                            approvalStatus: 'APPROVED',
                            wholesaleCustomerId: assignedId,
                        },
                    });
                    approvedCount++;
                    console.log(`[POS SYNC] Approved wholesale customer ${profile.fullName} (ID: ${assignedId})`);
                }
                else if (status === 'REJECTED') {
                    await prisma_1.prisma.customerProfile.update({
                        where: { id: web_profile_id },
                        data: {
                            approvalStatus: 'REJECTED',
                        },
                    });
                    rejectedCount++;
                    console.log(`[POS SYNC] Rejected wholesale application for ${profile.fullName}`);
                }
                // Mark as synced_back in POS DB
                const updateReq = pool.request();
                updateReq.input('id', posDb_1.sql.Int, posRecordId);
                await updateReq.query(`
          UPDATE web_wholesale_registrations
          SET synced_back = 1,
              notes = 'Successfully synced to web DB at ' + CONVERT(NVARCHAR(30), GETDATE(), 120)
          WHERE id = @id
        `);
            }
            catch (err) {
                console.error(`[POS SYNC] Error syncing POS record #${row.id}:`, err.message);
                errors.push({ posRecordId: row.id, error: err.message });
                // Update error note in POS DB so POS staff can see the reason
                try {
                    const errReq = pool.request();
                    errReq.input('id', posDb_1.sql.Int, row.id);
                    errReq.input('errNote', posDb_1.sql.NVarChar(1000), `Sync Error: ${err.message.substring(0, 950)}`);
                    await errReq.query(`
            UPDATE web_wholesale_registrations
            SET notes = @errNote
            WHERE id = @id
          `);
                }
                catch (_) { }
            }
        }
        if (approvedCount > 0 || rejectedCount > 0) {
            await prisma_1.prisma.posSyncLog.create({
                data: {
                    direction: 'INBOUND_PULL',
                    entityType: 'WHOLESALE_CUSTOMER',
                    status: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
                    payload: { approvedCount, rejectedCount, totalRecords: records.length, errors },
                },
            });
        }
        return { approvedCount, rejectedCount, errors };
    }
    catch (err) {
        console.error('[POS SYNC] pullApprovedWholesaleFromPOS failed:', err.message);
        await prisma_1.prisma.posSyncLog.create({
            data: {
                direction: 'INBOUND_PULL',
                entityType: 'WHOLESALE_CUSTOMER',
                status: 'ERROR',
                errorMessage: err.message,
            },
        }).catch(() => { });
        return { approvedCount, rejectedCount, errors: [{ error: err.message }] };
    }
}
/**
 * Runs a full bi-directional sync pass.
 */
async function runPosWholesaleSync() {
    if (isSyncRunning) {
        console.log('[POS SYNC] Previous sync pass still in progress, skipping...');
        return;
    }
    isSyncRunning = true;
    try {
        // 1. Push any new pending registrations to POS
        await pushPendingWholesaleRegistrations();
        // 2. Pull any approved/rejected registrations back from POS
        await pullApprovedWholesaleFromPOS();
    }
    catch (err) {
        console.error('[POS SYNC] Error in runPosWholesaleSync:', err.message);
    }
    finally {
        isSyncRunning = false;
    }
}
/**
 * Starts the POS synchronization cron job.
 * Default schedule: every 2 minutes.
 */
function startPosSyncCron() {
    const cronSchedule = process.env.POS_SYNC_CRON || '*/2 * * * *';
    console.log(`[POS SYNC] Scheduling wholesale customer sync cron with schedule: "${cronSchedule}"`);
    // Run once after 5 seconds delay so server boots cleanly
    setTimeout(() => {
        console.log('[POS SYNC] Running initial boot sync check...');
        runPosWholesaleSync().catch((err) => {
            console.warn('[POS SYNC] Initial sync check error (non-fatal):', err.message);
        });
    }, 5000);
    node_cron_1.default.schedule(cronSchedule, async () => {
        try {
            await runPosWholesaleSync();
        }
        catch (err) {
            console.error('[POS SYNC] Cron task encountered error:', err.message);
        }
    });
}
//# sourceMappingURL=posSync.js.map