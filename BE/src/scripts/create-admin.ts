import 'dotenv/config';
import { RowDataPacket } from 'mysql2/promise';
import pool from '../config/database.js';
import { hashPassword } from '../modules/auth/password.util.js';

interface ExistingAdmin extends RowDataPacket {
  user_id: number;
}

async function createFirstAdmin() {
  const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME } =
    process.env;
  const adminPhone = process.env.ADMIN_PHONE || null;

  if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_FULL_NAME) {
    throw new Error(
      'Set ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_FULL_NAME before running this command.',
    );
  }

  if (ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [admins] = await connection.query<ExistingAdmin[]>(
      "SELECT user_id FROM users WHERE role = 'Admin' LIMIT 1 FOR UPDATE",
    );
    if (admins.length > 0) {
      throw new Error('An admin account already exists; no account was created.');
    }

    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    await connection.query(
      `INSERT INTO users
        (username, email, password_hash, full_name, phone, role, status)
       VALUES (?, ?, ?, ?, ?, 'Admin', 'Active')`,
      [
        ADMIN_USERNAME.trim(),
        ADMIN_EMAIL.trim().toLowerCase(),
        passwordHash,
        ADMIN_FULL_NAME.trim(),
        adminPhone,
      ],
    );

    await connection.commit();
    console.log(`Created the single admin account for ${ADMIN_EMAIL}.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

createFirstAdmin()
  .catch((error: unknown) => {
    console.error(
      'Could not create the admin account:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
