// api/bip.js — Vercel Serverless Function
// Consulta saldo Bip via ScrapingBee (proxy chileno) y retorna JSON limpio

export default async function handler(req, res) {
  const SCRAPINGBEE_KEY = process.env.SCRAPINGBEE_KEY;
  const BIP_CARD        = process.env.BIP_CARD_NUMBER || '78210302';

  if (!SCRAPINGBEE_KEY) {
    return res.status(500).json({ error: 'SCRAPINGBEE_KEY no configurada' });
  }

  const bipBody = [
    'accion=6', 'NumDistribuidor=99', 'NomUsuario=usuInternet',
    'NomHost=AFT', 'NomDominio=aft.cl', 'Trx=', 'RutUsuario=0',
    `NumTarjeta=${BIP_CARD}`, 'bloqueable='
  ].join('&');

  const scrapingBeeUrl =
    `https://app.scrapingbee.com/api/v1/` +
    `?api_key=${SCRAPINGBEE_KEY}` +
    `&url=http://pocae.tstgo.cl/PortalCAE-WAR-MODULE/SesionPortalServlet` +
    `&render_js=false&premium_proxy=true&country_code=cl`;

  try {
    const response = await fetch(scrapingBeeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bipBody,
    });

    if (!response.ok) {
      return res.status(502).json({ error: `ScrapingBee error: ${response.status}` });
    }

    const html = await response.text();

    // Extraer celdas con class="verdanabold-ckc" — índice 5 = saldo
    const regex = /class="verdanabold-ckc"[^>]*>([^<]*)<\/td>/gi;
    const matches = [...html.matchAll(regex)];

    if (matches.length < 6) {
      return res.status(502).json({ error: 'No se pudo parsear el HTML', cells: matches.length });
    }

    const rawBalance = matches[5][1].trim();
    const balance    = parseInt(rawBalance.replace(/[$.,]/g, ''));

    return res.json({ balance, rawBalance, cardNumber: BIP_CARD, ok: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
