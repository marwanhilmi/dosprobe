import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { BackendProvider } from './contexts/BackendContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebSocketProvider>
      <BackendProvider>
        <App />
      </BackendProvider>
    </WebSocketProvider>
  </StrictMode>,
)
