import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginScreen from './components/LoginScreen';
import PlanSelector from './components/PlanSelector';
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
import ContentCalendar from './pages/ContentCalendar';
import CRM from './pages/CRM';
import Meetings from './pages/Meetings';
import MeetingDetail from './pages/MeetingDetail';
import SharedMeeting from './pages/SharedMeeting';
import Forms from './pages/Forms';
import FormBuilder from './pages/FormBuilder';
import FormResponses from './pages/FormResponses';
import FormPlayer from './pages/FormPlayer';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/shared/:token" element={<SharedMeeting />} />
        <Route path="/f/:slug" element={<FormPlayer />} />
        <Route path="*" element={<LoginScreen />} />
      </Routes>
    );
  }

  return (
    <>
    {!user.plan && <PlanSelector />}
    <Routes>
      <Route path="/shared/:token" element={<SharedMeeting />} />
      <Route path="/f/:slug" element={<FormPlayer />} />
      <Route element={<Layout />}>
        <Route path="/ai-ceo" element={<AiCeo />} />
        <Route path="/ai-ceo/:sessionId" element={<AiCeo />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/content" element={<Content />} />
        <Route path="/outlier-detector" element={<OutlierDetector />} />
        <Route path="/content-calendar" element={<ContentCalendar />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/products" element={<Products />} />
        <Route path="/forms" element={<Forms />} />
        <Route path="/forms/:id/edit" element={<FormBuilder />} />
        <Route path="/forms/:id/responses" element={<FormResponses />} />
        <Route path="/crm" element={<CRM />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/meetings/:id" element={<MeetingDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
    </>
  );
}

export default App;
