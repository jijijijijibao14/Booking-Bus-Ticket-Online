import 'dotenv/config';
import pool from '../config/database.js';
import { hashPassword } from '../modules/auth/password.util.js';
async function migratePasswords() {
    const connection = await pool.getConnection();
    try {
        const [passwordColumns] = await connection.query(`SELECT COLUMN_NAME AS name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('password_plain', 'password_hash')`);
        const hasPlaintextColumn = passwordColumns.some((column) => column.name === 'password_plain');
        let hasHashColumn = passwordColumns.some((column) => column.name === 'password_hash');
        if (!hasHashColumn && !hasPlaintextColumn) {
            throw new Error('users table has neither password_plain nor password_hash.');
        }
        if (!hasHashColumn) {
            await connection.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL');
            hasHashColumn = true;
        }
        if (hasPlaintextColumn) {
            const [users] = await connection.query('SELECT user_id, password_plain, password_hash FROM users');
            for (const user of users) {
                if (user.password_hash !== null)
                    continue;
                if (!user.password_plain || user.password_plain === 'GoogleAuth_NoPassword') {
                    continue;
                }
                const passwordHash = await hashPassword(user.password_plain);
                await connection.query('UPDATE users SET password_hash = ? WHERE user_id = ? AND password_hash IS NULL', [passwordHash, user.user_id]);
            }
            const [unmigratedRows] = await connection.query(`SELECT COUNT(*) AS row_count
         FROM users
         WHERE password_hash IS NULL
           AND (password_plain IS NULL OR password_plain <> 'GoogleAuth_NoPassword')`);
            if (Number(unmigratedRows[0].row_count) > 0) {
                throw new Error('Some account passwords could not be migrated; plaintext column was kept.');
            }
        }
        const [adminRows] = await connection.query("SELECT COUNT(*) AS row_count FROM users WHERE role = 'Admin'");
        if (Number(adminRows[0].row_count) > 1) {
            throw new Error('More than one admin exists. Resolve duplicate admin accounts before enforcing the single-admin constraint.');
        }
        if (hasPlaintextColumn) {
            await connection.query('ALTER TABLE users DROP COLUMN password_plain');
        }
        const [guardColumns] = await connection.query(`SELECT COLUMN_NAME AS name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'admin_account_guard'`);
        if (guardColumns.length === 0) {
            await connection.query(`ALTER TABLE users
         ADD COLUMN admin_account_guard TINYINT
           GENERATED ALWAYS AS (
             CASE WHEN role = 'Admin' THEN 1 ELSE NULL END
           ) STORED`);
        }
        const [adminIndexes] = await connection.query(`SELECT INDEX_NAME AS name
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND INDEX_NAME = 'uq_users_single_admin'
       LIMIT 1`);
        if (adminIndexes.length === 0) {
            await connection.query('ALTER TABLE users ADD UNIQUE KEY uq_users_single_admin (admin_account_guard)');
        }
        console.log(hasPlaintextColumn
            ? 'Password hashes migrated; plaintext password column removed and admin uniqueness enforced.'
            : 'Password schema checked; single-admin constraint enforced.');
    }
    finally {
        connection.release();
    }
}
migratePasswords()
    .catch((error) => {
    console.error('Could not migrate password storage:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
})
    .finally(async () => {
    await pool.end();
});
