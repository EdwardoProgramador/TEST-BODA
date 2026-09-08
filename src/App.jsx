import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Tiempos from './pages/Tiempos.jsx';
import Shipping from './pages/Shipping.jsx';
import CrossData from './pages/CrossData.jsx';
import Datos from './pages/Datos.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Tiempos />} />
        <Route path="/shipping" element={<Shipping />} />
        <Route path="/cross-data" element={<CrossData />} />
        <Route path="/datos" element={<Datos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
