import React from 'react'
import { createRoot } from 'react-dom/client'
import { Editor } from './Editor'
import '../shared.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>
)
