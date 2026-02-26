import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

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

// Protected Route Wrapper
const ProtectedRoute = ({ user, userRole, allowedRoles, children }) => {
  const activeApartmentId = localStorage.getItem('activeApartmentId');
  const location = useLocation();

  if (!user) {
    const isTenantPath = location.pathname.startsWith('/tenant-');
    return <Navigate to={isTenantPath ? "/tenant-login" : "/login"} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    if (userRole === 'tenant') return <Navigate to="/tenant-dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  // If owner/manager/staff hasn't picked a building, redirect to picker
  const isAddingBuilding = location.pathname === '/settings' && new URLSearchParams(location.search).get('action') === 'add';

  if ((userRole === 'owner' || userRole === 'manager' || userRole === 'staff') &&
    !activeApartmentId &&
    location.pathname !== '/picker' &&
    !isAddingBuilding) {
    return <Navigate to="/picker" replace />;
  }

  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          let docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            let currentRole = docSnap.data().role || 'owner';
            const userData = docSnap.data();

            // Check if user has specific apartment roles (e.g. they are a staff member)
            // We use the active apartment ID if available to determine their role for that context,
            // or if they have any apartmentRoles, we prioritize that over the default 'owner' role.
            const activeAptId = localStorage.getItem('activeApartmentId');
            if (activeAptId && userData.apartmentRoles && userData.apartmentRoles[activeAptId]) {
              currentRole = userData.apartmentRoles[activeAptId].role;
            } else if (userData.apartmentRoles && Object.keys(userData.apartmentRoles).length > 0) {
              // If they don't have an active apartment yet but are staff somewhere, they are a manager/staff
              const firstAptId = Object.keys(userData.apartmentRoles)[0];
              currentRole = userData.apartmentRoles[firstAptId].role;
            }

            // Auto-promote to tenant if email matches a room
            if (currentRole === 'owner') {
              const roomsQuery = query(collection(db, 'rooms'), where('tenantEmail', '==', currentUser.email));
              const roomsSnap = await getDocs(roomsQuery);
              if (!roomsSnap.empty) {
                await updateDoc(docRef, { role: 'tenant' });
                currentRole = 'tenant';
              }
            }

            setUserRole(currentRole);
          } else {
            setUserRole('owner');
          }
        } catch (error) {
          console.error("Error fetching user role", error);
        }
      } else {
        setUserRole(null);
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
        <Route path="/" element={
          user ? (
            userRole === 'tenant' ? <Navigate to="/tenant-dashboard" replace /> : <Navigate to="/picker" replace />
          ) : (
            <Navigate to="/tenant-login" replace />
          )
        } />
        <Route path="/login" element={<Login user={user} />} />
        <Route path="/tenant-login" element={<TenantLogin user={user} />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/picker" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['owner', 'manager', 'staff']}>
            <BuildingPicker user={user} />
          </ProtectedRoute>
        } />

        <Route path="/dashboard" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['owner', 'manager', 'staff']}>
            <Dashboard user={user} />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['owner', 'manager', 'staff']}>
            <ApartmentSettings user={user} />
          </ProtectedRoute>
        } />
        <Route path="/rooms" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['owner', 'manager', 'staff']}>
            <RoomManagement user={user} />
          </ProtectedRoute>
        } />

        {/* Tenant Routes */}
        <Route path="/tenant-dashboard" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['tenant']}>
            <TenantDashboard user={user} />
          </ProtectedRoute>
        } />

        <Route path="/tenants" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['owner', 'manager', 'staff']}>
            <TenantManagement user={user} />
          </ProtectedRoute>
        } />

        <Route path="/tenant-history" element={
          <ProtectedRoute user={user} userRole={userRole} allowedRoles={['owner', 'manager', 'staff']}>
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

        {/* Join Routes */}
        <Route path="/join/:aptId/:roomNum" element={<TenantJoin user={user} userRole={userRole} />} />
        <Route path="/join-staff/:aptId" element={<StaffJoin user={user} userRole={userRole} />} />
        <Route path="/join-tenant/:aptId" element={<TenantJoinGeneral user={user} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
