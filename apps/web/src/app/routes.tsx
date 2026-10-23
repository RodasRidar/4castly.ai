import { Navigate, type RouteObject } from 'react-router'
import { AuthCallbackPage, LoginPage } from '../features/auth/LoginPage'
import { ConversationPage } from '../features/conversation/ConversationPage'
import { NotFoundPage } from '../features/errors/NotFoundPage'
import { RouteError } from '../features/errors/RouteError'
import { NewForecastPage } from '../features/forecast/NewForecastPage'
import { HistoryPage } from '../features/history/HistoryPage'
import { PreferencesPage } from '../features/settings/PreferencesPage'
import { ProfilePage } from '../features/settings/ProfilePage'
import { AppLayout } from '../layouts/AppLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { ConversationLayout } from '../layouts/ConversationLayout'
import { RootLayout } from '../layouts/RootLayout'
import { SettingsLayout } from '../layouts/SettingsLayout'
import { RedirectIfAuthed, RequireAuth } from './guards'

/** Route table from plan section 8.2. `dev` routes are only added by main.tsx in development. */
export function createRoutes(devRoutes: RouteObject[] = []): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Navigate to="/nuevo" replace /> },
        {
          element: <RedirectIfAuthed />,
          children: [
            {
              element: <AuthLayout />,
              children: [
                { path: 'login', element: <LoginPage /> },
                { path: 'auth/callback', element: <AuthCallbackPage /> },
              ],
            },
          ],
        },
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AppLayout />,
              children: [
                { path: 'nuevo', element: <NewForecastPage /> },
                { path: 'historial', element: <HistoryPage /> },
                {
                  path: 'c/:conversationId',
                  element: <ConversationLayout />,
                  children: [
                    { index: true, element: <ConversationPage /> },
                    {
                      path: 'productos/:productCode',
                      lazy: async () => ({ Component: (await import('../features/product/ProductDetailPage')).ProductDetailPage }),
                    },
                  ],
                },
              ],
            },
            {
              path: 'configuracion',
              element: <SettingsLayout />,
              children: [
                { index: true, element: <Navigate to="perfil" replace /> },
                { path: 'perfil', element: <ProfilePage /> },
                { path: 'preferencias', element: <PreferencesPage /> },
              ],
            },
          ],
        },
        ...devRoutes,
        { path: '*', element: <NotFoundPage standalone /> },
      ],
    },
  ]
}
