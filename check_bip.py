import os
import re
import sys
import urllib.request
import urllib.parse

# ── Configuración ──────────────────────────────────────────────
BIP_CARD_NUMBER   = os.environ.get("BIP_CARD_NUMBER", "78210302")
BALANCE_THRESHOLD = int(os.environ.get("BALANCE_THRESHOLD", "1500"))
CALLMEBOT_PHONE   = os.environ.get("CALLMEBOT_PHONE", "")   # ej: 56912345678
CALLMEBOT_APIKEY  = os.environ.get("CALLMEBOT_APIKEY", "")
# ───────────────────────────────────────────────────────────────

BIP_URL  = "http://pocae.tstgo.cl/PortalCAE-WAR-MODULE/SesionPortalServlet"
BIP_BODY = (
    "accion=6&NumDistribuidor=99&NomUsuario=usuInternet"
    "&NomHost=AFT&NomDominio=aft.cl&Trx=&RutUsuario=0"
    f"&NumTarjeta={BIP_CARD_NUMBER}&bloqueable="
)
CALLMEBOT_URL = "https://api.callmebot.com/whatsapp.php"


def get_bip_balance():
    """Consulta el saldo Bip y retorna (int_pesos, str_raw)."""
    req = urllib.request.Request(
        BIP_URL,
        data=BIP_BODY.encode("utf-8"),
        headers={
            "Content-Type":  "application/x-www-form-urlencoded",
            "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Referer":       "https://www.tarjetabip.cl/testPOCAE.php",
            "Accept-Language": "es-CL,es;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("latin-1", errors="replace")

    # El HTML tiene celdas con class="verdanabold-ckc"
    # Índice 5 (base 0) corresponde al saldo, ej: "$1.240"
    cells = re.findall(
        r'class="verdanabold-ckc"[^>]*>(.*?)</td>',
        html, re.IGNORECASE | re.DOTALL
    )
    if len(cells) < 6:
        raise ValueError(f"Respuesta inesperada. Celdas encontradas: {len(cells)}")

    raw = cells[5].strip()
    amount = int(raw.replace("$", "").replace(".", "").replace(",", "").strip())
    return amount, raw


def send_whatsapp(message: str):
    """Envía mensaje WhatsApp via CallMeBot."""
    if not CALLMEBOT_PHONE or not CALLMEBOT_APIKEY:
        print("CALLMEBOT_PHONE o CALLMEBOT_APIKEY no configurados. Sin notificacion.")
        return
    params = urllib.parse.urlencode({
        "phone":  CALLMEBOT_PHONE,
        "text":   message,
        "apikey": CALLMEBOT_APIKEY,
    })
    req = urllib.request.Request(
        f"{CALLMEBOT_URL}?{params}",
        headers={"User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        print(f"CallMeBot: {resp.status} — {body[:150]}")


def main():
    print(f"Consultando saldo tarjeta Bip {BIP_CARD_NUMBER}...")
    try:
        balance, raw = get_bip_balance()
    except Exception as e:
        print(f"ERROR consultando saldo: {e}")
        sys.exit(1)

    print(f"Saldo actual: {raw}")

    if balance < BALANCE_THRESHOLD:
        msg = (
            f"Tarjeta Bip {BIP_CARD_NUMBER} - Saldo bajo!\n"
            f"Saldo: {raw}\n"
            f"Minimo recomendado: ${BALANCE_THRESHOLD}\n"
            f"Recarga tu tarjeta."
        )
        print(f"Saldo bajo umbral (${BALANCE_THRESHOLD}). Enviando WhatsApp...")
        send_whatsapp(msg)
    else:
        print(f"Saldo OK (sobre ${BALANCE_THRESHOLD}). Sin notificacion.")


if __name__ == "__main__":
    main()
