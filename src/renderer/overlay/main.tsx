import React from 'react'
import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'
import '../shared.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
)
