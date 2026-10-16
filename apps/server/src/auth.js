import { randomBytes, randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import cookie from 'cookie';
import { one, rows, sqlDate } from './db.js';

const COOKIE = 'ocw_session';
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const hashPassword = (password) => bcrypt.hash(password, 12);
export const validUsername = (name) => typeof name === 'string' && /^[a-zA-Z0-9_.-]{3,64}$/.test(name);
export const validPassword = (password) => typeof password === 'string' && password.length >= 12 && password.length <= 128;

export function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'strict', path:'/', maxAge:7*86400*1000 });
}
export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'strict', path:'/' });
}
export async function createSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  await rows('INSERT INTO web_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',
    [digest(token),userId,sqlDate(new Date(Date.now()+7*86400*1000))]);
  setSessionCookie(res, token);
}
export async function sessionUser(req) {
  const token = cookie.parse(req.headers.cookie || '')[COOKIE];
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return one(`SELECT u.id,u.username,u.role,u.active FROM web_sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>NOW() AND u.active=1`,[digest(token)]);
}
export function requireUser(req,res,next) {
  sessionUser(req).then(user=>user ? (req.user=user,next()) : res.status(401).json({error:'Accesso richiesto'})).catch(next);
}
export function requireAdmin(req,res,next) {
  if (req.user?.role!=='admin') return res.status(403).json({error:'Solo amministratori'});
  next();
}
export async function login(req,res) {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const user = await one('SELECT * FROM users WHERE username=? AND active=1',[username]);
  if (!user || !(await bcrypt.compare(password,user.password_hash)))
    return res.status(401).json({error:'Credenziali non valide'});
  await createSession(res,user.id);
  res.json({user:{id:user.id,username:user.username,role:user.role}});
}
export async function logout(req,res) {
  const token = cookie.parse(req.headers.cookie || '')[COOKIE];
  if(token) await rows('DELETE FROM web_sessions WHERE token_hash=?',[digest(token)]);
  clearSessionCookie(res);res.json({ok:true});
}
export async function createUser(username,password,role='user') {
  if (!validUsername(username) || !validPassword(password) || !['user','admin'].includes(role)) throw new Error('Username o password non validi (password minimo 12 caratteri)');
  const id = randomUUID();
  await rows('INSERT INTO users(id,username,password_hash,role) VALUES (?,?,?,?)',[id,username,await hashPassword(password),role]);
  return {id,username,role};
}
