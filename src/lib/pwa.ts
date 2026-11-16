import { url } from './paths';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url('sw.js'), { scope: url() }).catch(() => {
      /* offline support is a progressive enhancement */
    });
  });
}
