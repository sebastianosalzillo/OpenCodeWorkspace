import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'workspace_user',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'opencode_workspace',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});

export async function rows(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}
export async function one(sql, params = []) {
  const result = await rows(sql, params);
  return result[0] ?? null;
}
export function sqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
