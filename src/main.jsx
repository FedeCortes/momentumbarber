import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'rgb(var(--surface-card))',
                color:      'rgb(var(--text-base))',
                border:     '1px solid rgb(var(--surface-border))',
                fontFamily: '"DM Sans", sans-serif',
                fontSize:   '14px',
                fontWeight: '500',
              },
              success: { iconTheme: { primary: '#C9A84C', secondary: 'rgb(var(--surface-card))' } },
              error:   { iconTheme: { primary: '#ef4444', secondary: 'rgb(var(--surface-card))' } },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
