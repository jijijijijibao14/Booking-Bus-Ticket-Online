import mysql, { RowDataPacket, OkPacket, ResultSetHeader } from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database:
    process.env.DB_NAME ||
    'booking',

  waitForConnections: true,
  connectionLimit: 10,
});
// const pool = mysql.createPool({
//     host: 'localhost',
//     user: 'root',
//     password: '140220',
//     database: 'transport_booking_db',
//     waitForConnections: true,
//     connectionLimit: 10, // Số lượng kết nối đồng thời tối đa
//     queueLimit: 0
// });

/**
 * Executes a SQL query using the connection pool.
 * This function provides a basic utility for interacting with the database,
 * which is a fundamental part of any application's "basic flow".
 *
 * @param sql The SQL query string.
 * @param params Optional parameters for the query.
 * @returns A promise that resolves to the query result.
 *          For SELECT statements, it returns an array of rows.
 *          For INSERT/UPDATE/DELETE statements, it returns an OkPacket/ResultSetHeader.
 */
export async function executeQuery<T extends RowDataPacket[] | OkPacket | ResultSetHeader>(
  sql: string,
  params?: any[]
): Promise<T> {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows as T;
  } catch (error) {
    console.error('Database query error:', error);
    throw error; // Re-throw the error for the caller to handle
  }
}

export default pool;