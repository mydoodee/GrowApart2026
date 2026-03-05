import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ResetPassword from './pages/ResetPassword';
import ApartmentSettings from './pages/ApartmentSettings';
import RoomManagement from './pages/RoomManagement';
import BuildingPicker from './pages/BuildingPicker';
import TenantDashboard from './pages/TenantDashboard';
import TenantJoin from './pages/TenantJoin';
import StaffJoin from './pages/StaffJoin';
import TenantManagement from './pages/TenantManagement';
import TenantHistory from './pages/TenantHistory';
import TenantJoinGeneral from './pages/TenantJoinGeneral';
import TenantLogin from './pages/TenantLogin';
import MeterCollection from './pages/MeterCollection';
import ContractManagement from './pages/ContractManagement';
import MonthlyBilling from './pages/MonthlyBilling';

// Protected Route Wrapper
const ProtectedRoute = ({ user, userRole, allowedContext, allowedRoles, children }) => {
  const location = useLocation();
  const storedContext = localStorage.getItem("loginContext");

  if (!user) {
    const isTenantPath = location.pathname.startsWith("/tenant-");
    return <Navigate to={isTenantPath ? "/tenant-login" : "/login"} replace />;
  }

  // If loading user data, show nothing or a spinner
  if (userRole === undefined || userRole === null) return null;

  // Derive current context
  let currentContext = storedContext;
  if (!currentContext) {
    currentContext = userRole === 'tenant' ? 'tenant' : 'provider';
  }

  // 1. Context Check (Portal mismatch)
  if (allowedContext && currentContext !== allowedContext) {
    if (currentContext === "tenant")
      return <Navigate to="/tenant-dashboard" replace />;
    return <Navigate to="/picker" replace />;
  }

  // 2. Role Check (Administrative access)
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // If they have the right context but wrong role (e.g. manager page but user is just staff with no perms)
    // for now just redirect to their portal root
    if (currentContext === "tenant") return <Navigate to="/tenant-dashboard" replace />;
    return <Navigate to="/picker" replace />;
  }

  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginContext, setLoginContext] = useState(localStorage.getItem("loginContext"));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const userData = docSnap.data();
            let finalRole = userData.role || "owner";

            // Override with apartment-specific role if possible
            const activeAptId = localStorage.getItem("activeApartmentId");
            if (activeAptId && userData.apartmentRoles && userData.apartmentRoles[activeAptId]) {
              finalRole = userData.apartmentRoles[activeAptId].role;
            }

            setUserRole(finalRole);
            console.log("[App] User Role Loaded:", finalRole);

            // Sync loginContext
            const storedCtx = localStorage.getItem("loginContext");
            let targetCtx = storedCtx;

            if (userData.role === 'tenant') {
              targetCtx = 'tenant';
            } else if (userData.role === 'owner' || userData.role === 'staff') {
              targetCtx = 'provider';
            }

            if (targetCtx && targetCtx !== storedCtx) {
              console.log("[App] Syncing Context to:", targetCtx);
              localStorage.setItem("loginContext", targetCtx);
              setLoginContext(targetCtx);
            } else if (!targetCtx && storedCtx) {
              setLoginContext(storedCtx);
            } else if (targetCtx) {
              setLoginContext(targetCtx);
            }
          } else {
            console.warn("[App] User doc not found for UID:", currentUser.uid);
            setUserRole(null);
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setUserRole(null);
        }
      } else {
        setUserRole(null);
        setLoginContext(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
        <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            user ? (
              loginContext === "tenant" ? (
                <Navigate to="/tenant-dashboard" replace />
              ) : (
                <Navigate to="/picker" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/login" element={<Login user={user} />} />
        <Route path="/tenant-login" element={<TenantLogin user={user} />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/picker"
          element={
            <ProtectedRoute user={user} userRole={userRole} allowedContext="provider">
              <BuildingPicker user={user} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute user={user} userRole={userRole} allowedContext="provider">
              <Dashboard user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute user={user} userRole={userRole} allowedContext="provider">
              <ApartmentSettings user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rooms"
          element={
            <ProtectedRoute user={user} userRole={userRole} allowedContext="provider">
              <RoomManagement user={user} />
            </ProtectedRoute>
          }
        />

        {/* Tenant Routes */}
        <Route
          path="/tenant-dashboard"
          element={
            <ProtectedRoute user={user} userRole={userRole} allowedContext="tenant">
              <TenantDashboard user={user} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tenants"
          element={
            <ProtectedRoute user={user} userRole={userRole} allowedContext="provider">
              <TenantManagement user={user} />
            </ProtectedRoute>
          }
        />

        <Route path="/tenant-history" element={
          <ProtectedRoute user={user} userRole={userRole}>
            <TenantHistory user={user} />
          </ProtectedRoute>
        } />

        <Route path="/meters" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['owner', 'manager', 'staff']}>
            <MeterCollection user={user} />
          </ProtectedRoute>
        } />

        <Route path="/contracts" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['owner', 'manager', 'staff']}>
            <ContractManagement user={user} />
          </ProtectedRoute>
        } />

        <Route path="/billing" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['owner', 'manager', 'staff']}>
            <MonthlyBilling user={user} />
          </ProtectedRoute>
        } />

        {/* Join Routes */}
        <Route
          path="/join/:aptId/:roomNum"
          element={<TenantJoin user={user} userRole={userRole} />}
        />
        <Route
          path="/join-staff/:aptId"
          element={<StaffJoin user={user} userRole={userRole} />}
        />
        <Route
          path="/join-tenant/:aptId"
          element={<TenantJoinGeneral user={user} />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
