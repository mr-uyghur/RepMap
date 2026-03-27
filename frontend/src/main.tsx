import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode enables extra dev-time checks without affecting production behavior.
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
