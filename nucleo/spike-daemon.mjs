import { chromium } from 'playwright';
import readline from 'readline';

async function run() {
  // Inicializamos el navegador manteniendo la instancia abierta
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Configuramos la interfaz para leer de stdin y escribir en stdout
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  // Emitimos un evento de inicio
  console.log(JSON.stringify({ status: 'ready', message: 'Daemon de Chromium iniciado' }));

  // Escuchamos comandos por stdin
  rl.on('line', async (line) => {
    try {
      const command = JSON.parse(line);
      
      if (command.action === 'goto' && command.url) {
        // Navegamos y extraemos información básica (ej. el título) sin cerrar el navegador
        await page.goto(command.url, { waitUntil: 'domcontentloaded' });
        const title = await page.title();
        console.log(JSON.stringify({ status: 'success', title, url: page.url() }));
      } else if (command.action === 'close') {
        // Cerramos el navegador y terminamos el proceso
        await browser.close();
        console.log(JSON.stringify({ status: 'closed' }));
        process.exit(0);
      } else {
        console.log(JSON.stringify({ status: 'error', message: 'Comando desconocido o mal formado' }));
      }
    } catch (e) {
      console.log(JSON.stringify({ status: 'error', message: e.message }));
    }
  });
}

run().catch(e => {
  console.error(JSON.stringify({ status: 'fatal', message: e.message }));
  process.exit(1);
});
