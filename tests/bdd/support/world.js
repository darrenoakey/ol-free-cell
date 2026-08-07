import { After, Before, BeforeAll, AfterAll, setDefaultTimeout, setWorldConstructor } from '@cucumber/cucumber';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const webRoot = normalize(join(import.meta.dirname, '../../../web'));
const contentTypes = new Map([
  ['.css', 'text/css'],
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
]);

let browser;
let server;
let rootUrl;

class FreeCellWorld {
  page;
  context;
}

setWorldConstructor(FreeCellWorld);
setDefaultTimeout(30_000);

BeforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = normalize(join(webRoot, relativePath));
    if (!filePath.startsWith(`${webRoot}/`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream' });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  rootUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

Before(async function () {
  this.context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  this.page = await this.context.newPage();
});

After(async function () {
  await this.context.close();
});

AfterAll(async () => {
  const done = [];
  const b = browser;
  browser = undefined;
  const s = server;
  server = undefined;
  if (b) done.push(Promise.resolve().then(() => b.close()).catch(() => {}));
  if (s) {
    try { if (typeof s.closeAllConnections === 'function') s.closeAllConnections(); } catch (_) {}
    done.push(new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      try { s.close(finish); } catch (_) { finish(); }
      setTimeout(finish, 250);
    }));
  }
  await Promise.race([
    Promise.all(done),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
});

export { rootUrl };
