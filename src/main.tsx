import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/app/index.css'
import App from '@/app/App.tsx'

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
      if ('caches' in window) {
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
          .then(() => {
            (window as Window).location.reload();
          });
      } else {
        (window as Window).location.reload();
      }
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }
}

if (typeof performance !== 'undefined' && performance.mark) {
  performance.mark('sinesa_main_start');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
