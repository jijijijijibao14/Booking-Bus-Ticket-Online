import 'dotenv/config';
import pool from '../config/database.js';
import { hashPassword } from '../modules/auth/password.util.js';
async function resetAdminPassword() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before running this command.');
    }
    if (password.length < 12) {
        throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
    }
    const [admins] = await pool.query("SELECT user_id FROM users WHERE role = 'Admin' AND email = ? LIMIT 2", [email]);
    if (admins.length !== 1) {
        throw new Error(admins.length === 0
            ? `No admin account found for ${email} in database ${process.env.DB_NAME || 'booking'}.`
            : `More than one admin account found for ${email}; no password was changed.`);
    }
    const passwordHash = await hashPassword(password);
    const [result] = await pool.execute("UPDATE users SET password_hash = ? WHERE user_id = ? AND role = 'Admin'", [passwordHash, admins[0].user_id]);
    if (!('affectedRows' in result) || result.affectedRows !== 1) {
        throw new Error('The admin password was not updated; no account was changed.');
    }
    console.log(`Updated the admin password for ${email} in database ${process.env.DB_NAME || 'booking'}.`);
}
resetAdminPassword()
    .catch((error) => {
    console.error('Could not reset the admin password:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
})
    .finally(async () => {
    await pool.end();
});
