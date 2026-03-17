import './assets/main.css'
import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { HashRouter } from 'react-router-dom'
import { SpacetimeDBProvider } from './SpacetimeDBProvider'
import { ErrorBoundary } from './ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <SpacetimeDBProvider>
          <App />
        </SpacetimeDBProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
