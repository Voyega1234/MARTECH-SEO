import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import LegacyApp from './App.tsx';
import NewApp from './NewApp.tsx';
import TestTable from './pages/TestTable.tsx';
import './index.css';

function Router() {
  const path = window.location.pathname;
  if (path === '/testtable') return <TestTable />;
  if (path === '/legacy') return <LegacyApp />;
  if (path === '/keyword-expansion') return <NewApp />;
  return <NewApp />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
