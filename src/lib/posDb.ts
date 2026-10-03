import sql from 'mssql';

const posDbConfig: sql.config = {
  server: process.env.POS_DB_HOST || 'transasiadxb.ddns.net',
  port: parseInt(process.env.POS_DB_PORT || '5050', 10),
  database: process.env.POS_DB_NAME || 'softcodeTACSub',
  user: process.env.POS_DB_USER || 'SCTACWeb',
  password: process.env.POS_DB_PASSWORD || 'SoftTAC@1234#Web!',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 15000,
    requestTimeout: 30000,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getPosDb(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }
  
  if (pool && pool.connecting) {
    // Wait until connected
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (pool.connected) return pool;
  }

  try {
    pool = await new sql.ConnectionPool(posDbConfig).connect();
    pool.on('error', (err) => {
      console.error('[POS DB] Pool error:', err.message);
      pool = null;
    });
    return pool;
  } catch (err: any) {
    console.error('[POS DB] Failed to connect to POS SQL Server:', err.message);
    pool = null;
    throw err;
  }
}

export { sql };
