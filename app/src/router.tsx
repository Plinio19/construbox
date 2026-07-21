import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Configuracoes from './pages/configuracoes/Configuracoes';
import ObrasPage from './pages/obras/ObrasPage';
import EmBreve from './pages/EmBreve';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true,                        element: <Dashboard /> },
      { path: 'obras',                      element: <ObrasPage /> },
      { path: 'obras/:id',                  element: <EmBreve titulo="Obra" /> },
      { path: 'obras/:id/cronograma',       element: <EmBreve titulo="Cronograma" /> },
      { path: 'modelos',                    element: <EmBreve titulo="Modelos" /> },
      { path: 'cadastros/clientes',         element: <EmBreve titulo="Clientes" /> },
      { path: 'cadastros/prestadores',      element: <EmBreve titulo="Prestadores" /> },
      { path: 'cadastros/funcionarios',     element: <EmBreve titulo="Funcionários" /> },
      { path: 'cadastros/materiais',        element: <EmBreve titulo="Materiais" /> },
      { path: 'financeiro/receber',         element: <EmBreve titulo="Contas a Receber" /> },
      { path: 'financeiro/pagar',           element: <EmBreve titulo="Contas a Pagar" /> },
      { path: 'financeiro/extrato',         element: <EmBreve titulo="Extrato" /> },
      { path: 'compras',                    element: <EmBreve titulo="Compras" /> },
      { path: 'equipe',                     element: <EmBreve titulo="Equipe" /> },
      { path: 'relatorios',                 element: <EmBreve titulo="Relatórios" /> },
      { path: 'configuracoes',              element: <Configuracoes /> },
    ],
  },
]);
