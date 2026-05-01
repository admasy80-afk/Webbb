"use strict";

self.importScripts('/uv/uv.bundle.js');
self.importScripts('/uv/uv.config.js');

if (!self.Ultraviolet) {
    throw new Error("Ultraviolet failed to load: check uv.bundle.js");
}

(()=>{

var h = self.Ultraviolet;

const O = [
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "content-security-policy",
  "content-security-policy-report-only",
  "expect-ct",
  "feature-policy",
  "origin-isolation",
  "strict-transport-security",
  "upgrade-insecure-requests",
  "x-content-type-options",
  "x-download-options",
  "x-frame-options",
  "x-permitted-cross-domain-policies",
  "x-powered-by",
  "x-xss-protection"
];

const C = ["GET", "HEAD"];

class UVSW extends h.EventEmitter {
  constructor(e = __uv$config) {
    super();
    this.config = e;
    this.bareClient = new h.BareClient;
    if (!this.config.prefix) this.config.prefix = "/uv/service/";
  }

  route({ request: e }) {
    return e.url.startsWith(location.origin + this.config.prefix);
  }

  async fetch({ request: e }) {
    try {
      if (!this.route({ request: e })) return fetch(e);

      const uv = new h(this.config);

      const body = C.includes(e.method) ? null : await e.clone().blob();

      const req = {
        url: uv.sourceUrl(e.url),
        method: e.method,
        headers: Object.fromEntries(e.headers.entries()),
        body
      };

      const finalURL = req.url;

      const res = await this.bareClient.fetch(finalURL, req);

      const responseHeaders = new Headers(res.rawHeaders);

      for (const h of O) responseHeaders.delete(h);

      return new Response(res.body, {
        status: res.status,
        headers: responseHeaders
      });

    } catch (err) {
      console.error("UV SW ERROR:", err);
      return new Response("Service Worker Error", { status: 500 });
    }
  }
}

self.UVServiceWorker = UVSW;

})();
