import { createHashRouter } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import ObrasPage from './pages/obras/ObrasPage';
import CronogramaPage from './pages/obras/CronogramaPage';
import ModelosPage from './pages/modelos/ModelosPage';
import MateriaisPage from './pages/cadastros/MateriaisPage';
import ClientesPage from './pages/cadastros/ClientesPage';
import PrestadoresPage from './pages/cadastros/PrestadoresPage';
import FuncionariosPage from './pages/cadastros/FuncionariosPage';
import FinanceiroPage from './pages/financeiro/FinanceiroPage';
import ExtratoPage from './pages/financeiro/ExtratoPage';
import OFXPage from './pages/financeiro/OFXPage';
import RelatoriosPage from './pages/relatorios/RelatoriosPage';
import ComprasPage from './pages/compras/ComprasPage';
import EquipePage from './pages/equipe/EquipePage';
import Configuracoes from './pages/configuracoes/Configuracoes';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true,                        element: <Dashboard /> },
      { path: 'obras',                      element: <ObrasPage /> },
      { path: 'obras/:id',                  element: <ObrasPage /> },
      { path: 'obras/:id/cronograma',       element: <CronogramaPage /> },
      { path: 'modelos',                    element: <ModelosPage /> },
      { path: 'cadastros/clientes',         element: <ClientesPage /> },
      { path: 'cadastros/prestadores',      element: <PrestadoresPage /> },
      { path: 'cadastros/funcionarios',     element: <FuncionariosPage /> },
      { path: 'cadastros/materiais',        element: <MateriaisPage /> },
      { path: 'financeiro/receber',         element: <FinanceiroPage tipo="receita" /> },
      { path: 'financeiro/pagar',           element: <FinanceiroPage tipo="despesa" /> },
      { path: 'financeiro/extrato',         element: <ExtratoPage /> },
      { path: 'financeiro/ofx',            element: <OFXPage /> },
      { path: 'compras',                    element: <ComprasPage /> },
      { path: 'equipe',                     element: <EquipePage /> },
      { path: 'relatorios',                 element: <RelatoriosPage /> },
      { path: 'configuracoes',              element: <Configuracoes /> },
    ],
  },
]);
