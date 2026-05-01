app.get('/sw.js', (req, res) => {
  res.type('application/javascript').send(`
    self.skipWaiting();
    self.clients.claim();

    importScripts('/uv/uv.bundle.js');
    importScripts('/uv.config.js');
    importScripts('/uv/uv.sw.js');

    const sw = new UVServiceWorker();

    self.addEventListener('fetch', event => {
      event.respondWith(sw.fetch(event));
    });
  `);
});
