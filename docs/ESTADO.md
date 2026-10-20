> Este archivo lo lee Emily (asistente por voz). Actualízalo al cerrar cada avance.
# Estado — Saldo BIP

**Fecha de actualización:** 2026-10-20

## Resumen
Alerta de saldo bajo de tarjetas Bip (3 tarjetas: Andrés, Alex y "Vieja") con aviso por Telegram. Corre en el PC de Alex con el Programador de tareas de Windows, no en la nube.

## Qué funciona
- Script local `local/saldo-bip.js` con la tarea `\Saldo Bip` de Task Scheduler, martes y viernes a las 9:00 y 12:00 (vía `conhost --headless`).
- Umbrales: Andrés < $1.000, Alex < $2.000, Vieja < $1.000.
- `local/estado.json` marca las tarjetas ya notificadas en el día; la corrida de las 12:00 solo reintenta pendientes y avisa errores por Telegram.
- Función serverless de Vercel (`bip.js`) que consulta el saldo por parámetros de tarjeta.

## Pendientes / próximos pasos
- Reintentar integración con Emily: el saldo no se podía pedir por voz (ScrapingBee sin créditos, API de Movired caída al 5-oct). Por confirmar.

## Problemas conocidos
- `pocae.tstgo.cl` solo tiene http y está tras Radware (403 a IPs de datacenter).
- Browserless no abre sitios http planos: no volver a moverlo a n8n ni a Browserless.
- Si el PC está apagado, la tarea no corre.
- ScrapingBee de `saldo-bip.vercel.app` responde 401 (key vencida).
- Token del bot Telegram rotado el 2026-10-08. El flujo n8n, GitHub Actions `check_bip` y secrets CallMeBot fueron eliminados.

## Dónde está (URL de producción, repo, dependencias)
- Repo: github.com/WurfelSPA/saldoBIP
- Producción: corre local en el PC de Alex (Task Scheduler); URL de Vercel `saldo-bip.vercel.app` con scraping roto.
- Depende de: Telegram (bot @SaldoBIPAndres_bot), `local/.env` (ignorado por git), sitio pocae.tstgo.cl.
