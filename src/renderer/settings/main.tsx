import React from 'react'
import { createRoot } from 'react-dom/client'
import { Settings } from './Settings'
import '../shared.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>
)
