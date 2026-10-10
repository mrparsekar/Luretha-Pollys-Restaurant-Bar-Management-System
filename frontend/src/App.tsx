import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import Login from './screens/Login'
import Floor from './screens/Floor'
import NewOrder from './screens/NewOrder'
import Orders from './screens/Orders'
import Tab from './screens/Tab'
import MenuPick from './screens/MenuPick'
import Kot from './screens/Kot'
import StaffBill from './screens/StaffBill'
import PublicBill from './screens/PublicBill'
import TodaysSpecial from './screens/TodaysSpecial'
import Board from './screens/admin/Board'
import OrderAdmin from './screens/admin/OrderAdmin'
import Reports from './screens/admin/Reports'
import MenuManager from './screens/admin/MenuManager'
import TablesManager from './screens/admin/TablesManager'
import StaffManager from './screens/admin/StaffManager'
import SettingsScreen from './screens/admin/SettingsScreen'
import SpecialsManager from './screens/admin/SpecialsManager'
import SpecialsHistory from './screens/admin/SpecialsHistory'
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
  )
}
