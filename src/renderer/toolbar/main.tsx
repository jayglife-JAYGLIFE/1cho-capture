import React from 'react'
import { createRoot } from 'react-dom/client'
import { Toolbar } from './Toolbar'
import '../shared.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <Toolbar />
  </React.StrictMode>
)
