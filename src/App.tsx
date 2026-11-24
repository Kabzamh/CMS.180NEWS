import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Articles from './pages/Articles';
import ArticleEditor from './pages/ArticleEditor';
import Scheduled from './pages/Scheduled';
import Breaking from './pages/Breaking';
import Comments from './pages/Comments';
import Media from './pages/Media';
import Sections from './pages/Sections';
import Tags from './pages/Tags';
import Authors from './pages/Authors';
import Homepage from './pages/Homepage';
import Ads from './pages/Ads';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Account from './pages/Account';
import Notifications from './pages/Notifications';
import Mail from './pages/Mail';
import SiteLayout from './pages/site/SiteLayout';
import SiteHome from './pages/site/SiteHome';
import SiteStory from './pages/site/SiteStory';
import SiteSection from './pages/site/SiteSection';
import SiteStaff from './pages/site/SiteStaff';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/site" element={<SiteLayout />}>
            <Route index element={<SiteHome />} />
            <Route path="story/:id" element={<SiteStory />} />
            <Route path="section/:slug" element={<SiteSection />} />
            <Route path="staff" element={<SiteStaff />} />
          </Route>
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="articles" element={<Articles />} />
            <Route path="articles/new" element={<ArticleEditor />} />
            <Route path="articles/:id" element={<ArticleEditor />} />
            <Route path="scheduled" element={<Scheduled />} />
            <Route path="breaking" element={<Breaking />} />
            <Route path="comments" element={<Comments />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="mail" element={<Mail />} />
            <Route path="media" element={<Media />} />
            <Route path="categories" element={<Sections />} />
            <Route path="tags" element={<Tags />} />
            <Route path="authors" element={<Authors />} />
            <Route path="homepage" element={<Homepage />} />
            <Route path="ads" element={<Ads />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="users" element={<Users />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="*" element={<Navigate to="/site" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
