import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginScreen from './components/LoginScreen';
import Layout from './components/Layout';
import AiCeo from './pages/AiCeo';
import Dashboard from './pages/Dashboard';
import Content from './pages/Content';
import Marketing from './pages/Marketing';
import Inbox from './pages/Inbox';
import Sales from './pages/Sales';
import Products from './pages/Products';
import Settings from './pages/Settings';
import OutlierDetector from './pages/OutlierDetector';

function App() {
  const { user } = useAuth();

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/ai-ceo" element={<AiCeo />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/content" element={<Content />} />
        <Route path="/outlier-detector" element={<OutlierDetector />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/products" element={<Products />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
