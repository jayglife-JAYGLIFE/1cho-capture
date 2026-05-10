import React from 'react'
import { createRoot } from 'react-dom/client'
import { CaptureBox } from './CaptureBox'
import '../shared.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <CaptureBox />
  </React.StrictMode>
)
