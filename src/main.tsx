import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import {Auth0Provider} from "@auth0/auth0-react"

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

// Check if Auth0 is configured
const isAuth0Configured = domain && clientId && domain !== 'undefined' && clientId !== 'undefined';

console.log('Auth0 Configuration:', { domain, clientId, isAuth0Configured });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAuth0Configured ? (
      <Auth0Provider 
        domain={domain}
        clientId={clientId}
        authorizationParams={{
          redirect_uri: window.location.origin
        }}
      >
        <App />
      </Auth0Provider>
    ) : (
      <App />
    )}
  </StrictMode>,
)
