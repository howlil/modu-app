import { self } from '$app/service-worker';

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Asset caching is intentionally deferred until the offline policy is implemented
// as a tested vertical slice. User data must never be stored in Cache Storage.
