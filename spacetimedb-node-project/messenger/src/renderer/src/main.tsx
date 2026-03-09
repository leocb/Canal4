import './assets/main.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { HashRouter } from 'react-router-dom'
import { SpacetimeDBProvider } from './SpacetimeDBProvider'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <SpacetimeDBProvider>
         <App />
      </SpacetimeDBProvider>
    </HashRouter>
  </React.StrictMode>
)
