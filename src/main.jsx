import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { DataProvider } from './state/DataContext.jsx';
import './styles/app.css';

// HashRouter en lugar de BrowserRouter: así el build funciona servido desde
// GitHub Pages, desde un subdirectorio o abriendo dist/index.html a mano, sin
// necesitar que el servidor reescriba rutas.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <DataProvider>
        <App />
      </DataProvider>
    </HashRouter>
  </React.StrictMode>
);
