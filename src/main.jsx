import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@fontsource/permanent-marker/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/600.css'
import '@fontsource/oswald/700.css'
import '@/index.css'
import { askAccountEarly } from '@/lib/GuildContext'
import { prefetchPath } from '@/lib/routes'

// 6.24: start the account read and the page's own code (and its game) right away, alongside React starting up
askAccountEarly()
prefetchPath(window.location.pathname + window.location.search)

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)