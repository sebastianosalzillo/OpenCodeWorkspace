import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createUser } from './auth.js';
import { pool } from './db.js';

const rl = createInterface({input,output});
try {
  const username=(await rl.question('Nome account amministratore: ')).trim();
  const password=await rl.question('Password (minimo 12 caratteri, non usare quella di altri servizi): ');
  const result=await createUser(username,password,'admin');
  console.log('Creato:',result.username);
} catch(e) {console.error(e.message);process.exitCode=1;}
finally {rl.close();await pool.end();}
