import React from 'react'
import { createRoot } from 'react-dom/client'
import { ScrollController } from './ScrollController'
import '../shared.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <ScrollController />
  </React.StrictMode>
)
