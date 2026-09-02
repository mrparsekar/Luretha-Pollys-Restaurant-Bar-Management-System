import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { Spinner } from './components/ui'
import Login from './screens/Login'
import Floor from './screens/Floor'
import NewOrder from './screens/NewOrder'
import Orders from './screens/Orders'
import Tab from './screens/Tab'
import MenuPick from './screens/MenuPick'
import Kitchen from './screens/Kitchen'
import Kot from './screens/Kot'
import StaffBill from './screens/StaffBill'
import PublicBill from './screens/PublicBill'
import Board from './screens/admin/Board'
import OrderAdmin from './screens/admin/OrderAdmin'
import Reports from './screens/admin/Reports'
import MenuManager from './screens/admin/MenuManager'
import StaffManager from './screens/admin/StaffManager'
import SettingsScreen from './screens/admin/SettingsScreen'
import More from './screens/admin/More'
import Verify from './screens/admin/Verify'
import { useAuth } from './state/auth'

/**
 * Route gates are a convenience, not the security boundary: the API checks the
 * session and the role on every request, so a hand-typed /admin URL gets a 403
 * from the server even if this component were bypassed.
 */
function RequireAuth({ children, owner = false }: { children: ReactNode; owner?: boolean }) {
  const { user, booting, isOwner } = useAuth()
  const location = useLocation()

  if (booting) return <Spinner label="Signing in" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (owner && !isOwner) return <Navigate to="/floor" replace />
  return <>{children}</>
}

/** Owners start on the board, waiters on the floor. */
function Home(): ReactNode {
  const { user, booting, isOwner } = useAuth()
  if (booting) return <Spinner label="Loading" />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={isOwner ? '/admin' : '/floor'} replace />
}

export default function App(): ReactNode {
  return (
    <Routes>
      {/* Public: the link a guest gets on WhatsApp. */}
      <Route path="/bill/:token" element={<PublicBill />} />
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
        path="/kitchen"
        element={
          <RequireAuth>
            <Kitchen />
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
          <RequireAuth owner>
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
  )
}
