import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { LoadingScreen } from './components/ui'
const Login = lazy(() => import('./screens/Login'))
const Floor = lazy(() => import('./screens/Floor'))
const NewOrder = lazy(() => import('./screens/NewOrder'))
const Orders = lazy(() => import('./screens/Orders'))
const Tab = lazy(() => import('./screens/Tab'))
const MenuPick = lazy(() => import('./screens/MenuPick'))
const Kot = lazy(() => import('./screens/Kot'))
const StaffBill = lazy(() => import('./screens/StaffBill'))
const PublicBill = lazy(() => import('./screens/PublicBill'))
const TodaysSpecial = lazy(() => import('./screens/TodaysSpecial'))
const Board = lazy(() => import('./screens/admin/Board'))
const OrderAdmin = lazy(() => import('./screens/admin/OrderAdmin'))
const Reports = lazy(() => import('./screens/admin/Reports'))
const MenuManager = lazy(() => import('./screens/admin/MenuManager'))
const TablesManager = lazy(() => import('./screens/admin/TablesManager'))
const StaffManager = lazy(() => import('./screens/admin/StaffManager'))
const SettingsScreen = lazy(() => import('./screens/admin/SettingsScreen'))
const SpecialsManager = lazy(() => import('./screens/admin/SpecialsManager'))
const SpecialsHistory = lazy(() => import('./screens/admin/SpecialsHistory'))
const More = lazy(() => import('./screens/admin/More'))
const Verify = lazy(() => import('./screens/admin/Verify'))
import { useAuth } from './state/auth'

/**
 * Route gates are a convenience, not the security boundary: the API checks the
 * session and the role on every request, so a hand-typed /admin URL gets a 403
 * from the server even if this component were bypassed.
 */
function RequireAuth({ children, owner = false }: { children: ReactNode; owner?: boolean }) {
  const { user, booting, isOwner } = useAuth()
  const location = useLocation()

  if (booting) return null
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (owner && !isOwner) return <Navigate to="/floor" replace />
  return <>{children}</>
}

/** Owners start on the board, waiters on the floor. */
function Home(): ReactNode {
  const { user, booting, isOwner } = useAuth()
  if (booting) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={isOwner ? '/admin' : '/floor'} replace />
}

export default function App(): ReactNode {
  return (
    <Suspense fallback={<LoadingScreen label="Opening this screen" />}>
      <Routes>
      {/* Public: the link a guest gets on WhatsApp. */}
      <Route path="/bill/:token" element={<PublicBill />} />
      {/* Public: what every table's QR code opens - one page for the whole restaurant. */}
      <Route path="/special" element={<TodaysSpecial />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />

      <Route
        path="/floor"
        element={
          <RequireAuth>
            <Floor />
          </RequireAuth>
        }
      />
      <Route
        path="/new"
        element={
          <RequireAuth>
            <NewOrder />
          </RequireAuth>
        }
      />
      <Route
        path="/new/menu"
        element={
          <RequireAuth>
            <MenuPick />
          </RequireAuth>
        }
      />
      <Route
        path="/orders"
        element={
          <RequireAuth>
            <Orders />
          </RequireAuth>
        }
      />
      <Route
        path="/order/:id"
        element={
          <RequireAuth>
            <Tab />
          </RequireAuth>
        }
      />
      <Route
        path="/order/:id/menu"
        element={
          <RequireAuth>
            <MenuPick />
          </RequireAuth>
        }
      />
      <Route
        path="/order/:id/kot"
        element={
          <RequireAuth>
            <Kot />
          </RequireAuth>
        }
      />
      <Route
        path="/order/:id/bill"
        element={
          <RequireAuth>
            <StaffBill />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth owner>
            <Board />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/orders/:id"
        element={
          <RequireAuth>
            <OrderAdmin />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <RequireAuth owner>
            <Reports />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/menu"
        element={
          <RequireAuth owner>
            <MenuManager />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/tables"
        element={
          <RequireAuth owner>
            <TablesManager />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/staff"
        element={
          <RequireAuth owner>
            <StaffManager />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <RequireAuth owner>
            <SettingsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/specials"
        element={
          <RequireAuth owner>
            <SpecialsManager />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/specials/history"
        element={
          <RequireAuth owner>
            <SpecialsHistory />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/verify"
        element={
          <RequireAuth owner>
            <Verify />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/more"
        element={
          <RequireAuth owner>
            <More />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
