import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui';
import { ProtectedShell, RoleGate } from './components/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Articles from './pages/Articles';
import ArticleEditor from './pages/ArticleEditor';
import Scheduled from './pages/Scheduled';
import Media from './pages/Media';
import Mail from './pages/Mail';
import Notes from './pages/Notes';
import { Categories, TagsPage } from './pages/SectionsTags';
import Authors from './pages/Authors';
import Breaking from './pages/Breaking';
import Homepage from './pages/Homepage';
import Comments from './pages/Comments';
import Analytics from './pages/Analytics';
import Ads from './pages/Ads';
import Settings from './pages/Settings';
import Team from './pages/Team';
import Account from './pages/Account';
import NotFound from './pages/NotFound';

const editors = (page: ReactNode) => <RoleGate roles={['owner', 'editor']}>{page}</RoleGate>;

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedShell />}>
                <Route index element={<Dashboard />} />
                <Route path="articles" element={<Articles />} />
                <Route path="articles/new" element={<ArticleEditor key="new" />} />
                <Route path="articles/:id" element={<ArticleEditor key="edit" />} />
                <Route path="media" element={<Media />} />
                <Route path="mail" element={<Mail />} />
                <Route path="mail/:folder" element={<Mail />} />
                <Route path="notes" element={<Notes />} />
                <Route path="scheduled" element={editors(<Scheduled />)} />
                <Route path="breaking" element={editors(<Breaking />)} />
                <Route path="comments" element={editors(<Comments />)} />
                <Route path="categories" element={editors(<Categories />)} />
                <Route path="tags" element={editors(<TagsPage />)} />
                <Route path="authors" element={editors(<Authors />)} />
                <Route path="homepage" element={editors(<Homepage />)} />
                <Route path="ads" element={editors(<Ads />)} />
                <Route path="analytics" element={editors(<Analytics />)} />
                <Route path="settings" element={editors(<Settings />)} />
                <Route
                  path="users"
                  element={
                    <RoleGate roles={['owner']}>
                      <Team />
                    </RoleGate>
                  }
                />
                <Route path="sections" element={<Navigate to="/categories" replace />} />
                <Route path="team" element={<Navigate to="/users" replace />} />
                <Route path="account" element={<Account />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
