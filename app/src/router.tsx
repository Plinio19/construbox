import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import ObrasPage from './pages/obras/ObrasPage';
import ModelosPage from './pages/modelos/ModelosPage';
import MateriaisPage from './pages/cadastros/MateriaisPage';
import ClientesPage from './pages/cadastros/ClientesPage';
import PrestadoresPage from './pages/cadastros/PrestadoresPage';
import FuncionariosPage from './pages/cadastros/FuncionariosPage';
import FinanceiroPage from './pages/financeiro/FinanceiroPage';
import Configuracoes from './pages/configuracoes/Configuracoes';
import EmBreve from './pages/EmBreve';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true,                        element: <Dashboard /> },
      { path: 'obras',                      element: <ObrasPage /> },
      { path: 'obras/:id',                  element: <EmBreve titulo="Detalhes da Obra" /> },
      { path: 'obras/:id/cronograma',       element: <EmBreve titulo="Cronograma" /> },
      { path: 'modelos',                    element: <ModelosPage /> },
      { path: 'cadastros/clientes',         element: <ClientesPage /> },
      { path: 'cadastros/prestadores',      element: <PrestadoresPage /> },
      { path: 'cadastros/funcionarios',     element: <FuncionariosPage /> },
      { path: 'cadastros/materiais',        element: <MateriaisPage /> },
      { path: 'financeiro/receber',         element: <FinanceiroPage tipo="receita" /> },
      { path: 'financeiro/pagar',           element: <FinanceiroPage tipo="despesa" /> },
      { path: 'financeiro/extrato',         element: <EmBreve titulo="Extrato" /> },
      { path: 'compras',                    element: <EmBreve titulo="Compras" /> },
      { path: 'equipe',                     element: <EmBreve titulo="Equipe" /> },
      { path: 'relatorios',                 element: <EmBreve titulo="Relatórios" /> },
      { path: 'configuracoes',              element: <Configuracoes /> },
    ],
  },
]);
