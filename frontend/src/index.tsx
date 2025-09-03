import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import DynoAppV3 from './DynoAppV3';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <DynoAppV3 />
  </React.StrictMode>
);