// Desarrollado por Ing. Alex Meléndez — Patagónica Inmobiliaria, con la asistencia de Claude AI (Anthropic).
//
// Consulta el saldo de las tarjetas Bip desde este PC y avisa por Telegram.
// Corre local porque pocae.tstgo.cl (solo http, detrás de Radware) bloquea IPs de
// datacenter y el proxy residencial de Browserless no soporta http plano.
//
// Programado en Task Scheduler (\Saldo Bip): martes y viernes 9:00 y 12:00.
// El estado (local/estado.json) guarda qué tarjetas ya se notificaron hoy: la
// corrida de las 12:00 solo procesa las que faltan (PC apagado o error a las 9:00).
//
// Uso: node local/saldo-bip.js [--force]

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const STATE_FILE = path.join(DIR, 'estado.json');
const LOG_FILE = path.join(DIR, 'saldo-bip.log');

const CARDS = [
  { name: 'Andrés', card: '272058976', threshold: 1000 },
  { name: 'Alex',   card: '108682939', threshold: 2000 },
  { name: 'Vieja',  card: '330140724', threshold: 1000 },
];

const BIP_URL = 'http://pocae.tstgo.cl/PortalCAE-WAR-MODULE/SesionPortalServlet';
// Desde esta hora, si una tarjeta falla se avisa el error por Telegram (es el último intento del día)
const LAST_ATTEMPT_HOUR = 12;

function loadEnv() {
  const file = path.join(DIR, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function log(msg) {
  const line = `[${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // YYYY-MM-DD
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (s.date === today()) return s;
  } catch (e) { /* sin estado o corrupto: empezar de cero */ }
  return { date: today(), done: [] };
}

async function getBalance(card) {
  const body = 'accion=6&NumDistribuidor=99&NomUsuario=usuInternet&NomHost=AFT&NomDominio=aft.cl'
    + `&Trx=&RutUsuario=0&NumTarjeta=${card}&bloqueable=`;
  const r = await fetch(BIP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.tarjetabip.cl/testPOCAE.php',
      'Accept-Language': 'es-CL,es;q=0.9',
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = new TextDecoder('latin1').decode(await r.arrayBuffer());
  // Celdas class="verdanabold-ckc": índice 5 = saldo, ej "$11.875"
  const cells = [...html.matchAll(/class="verdanabold-ckc"[^>]*>([\s\S]*?)<\/td>/gi)]
    .map(m => m[1].replace(/<[^>]*>/g, '').trim());
  if (cells.length < 6) throw new Error(`respuesta inesperada (${cells.length} celdas)`);
  const rawBalance = cells[5];
  const balance = parseInt(rawBalance.replace(/[^0-9-]/g, ''), 10);
  if (isNaN(balance)) throw new Error(`no se pudo leer el saldo (${rawBalance})`);
  return { balance, rawBalance };
}

async function telegram(text) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en local/.env');
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Telegram HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function main() {
  loadEnv();
  const force = process.argv.includes('--force');
  const state = force ? { date: today(), done: [] } : loadState();
  const pending = CARDS.filter(c => !state.done.includes(c.card));

  if (!pending.length) {
    log('Todas las tarjetas ya fueron notificadas hoy. Nada que hacer.');
    return 0;
  }

  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago', hour: 'numeric', hour12: false }));
  let failures = 0;

  for (const c of pending) {
    try {
      const { balance, rawBalance } = await getBalance(c.card);
      const text = balance < c.threshold
        ? `⚠️ ${c.name} Bip ${c.card}\nSaldo actual: ${rawBalance}. Recargar.`
        : `✅ ${c.name} Bip ${c.card}\nSaldo OK: ${rawBalance}`;
      await telegram(text);
      state.done.push(c.card);
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      log(`${c.name} (${c.card}): ${rawBalance} — notificado`);
    } catch (e) {
      failures++;
      log(`${c.name} (${c.card}): ERROR ${e.message}`);
      if (hour >= LAST_ATTEMPT_HOUR) {
        try { await telegram(`❌ No se pudo consultar el saldo Bip de ${c.name} (${c.card}): ${e.message}`); }
        catch (e2) { log(`No se pudo avisar el error por Telegram: ${e2.message}`); }
      }
    }
  }
  return failures ? 1 : 0;
}

main().then(code => process.exit(code), e => { log(`ERROR fatal: ${e.message}`); process.exit(1); });
