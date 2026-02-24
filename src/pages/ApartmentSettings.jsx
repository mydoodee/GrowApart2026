import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    collection, doc, getDoc, getDocs, setDoc, addDoc,
    query, where, serverTimestamp, updateDoc, deleteField, onSnapshot
} from 'firebase/firestore';
import { db, auth, storage2 } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
    Save, Layers, CheckCircle2,
    Plus, Trash2, MapPin, Info, LayoutGrid, ClipboardList, Check, Phone, QrCode, User, CreditCard, Building,
    Zap, Droplets, PlusSquare, X, MessageSquare, Loader2, Link as LinkIcon, Search, ChevronDown
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Toast, { useToast } from '../components/Toast';
import MainLayout from '../components/MainLayout';
import { getUserApartments } from '../utils/apartmentUtils';

export default function ApartmentSettings({ user }) {
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('general');
    const [searchParams] = useSearchParams();
    const isAddMode = searchParams.get('action') === 'add';

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam) setActiveTab(tabParam);
        else setActiveTab('general');
    }, [searchParams]);

    const [profile, setProfile] = useState(null);
    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));

    const [generalInfo, setGeneralInfo] = useState({
        name: '', address: '', phone: '', logoURL: ''
    });
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [bankDetails, setBankDetails] = useState({
        name: '', accountName: '', accountNo: '', promptpay: ''
    });
    const [floors, setFloors] = useState([{ id: 1, roomCount: 5 }]);
    const [amenities, setAmenities] = useState([
        { name: 'เครื่องปรับอากาศ', status: false },
        { name: 'พัดลม', status: false },
        { name: 'เตียงนอน', status: false },
        { name: 'ตู้เสื้อผ้า', status: false },
        { name: 'เครื่องทำน้ำอุ่น', status: false },
        { name: 'ตู้เย็น', status: false },
        { name: 'โทรทัศน์', status: false },
        { name: 'โต๊ะเครื่องแป้ง', status: false },
        { name: 'WiFi', status: false }
    ]);
    const [newAmenityName, setNewAmenityName] = useState('');
    const [managers, setManagers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [staffMembers, setStaffMembers] = useState([]);
    const [tenants, setTenants] = useState([]);
    const [selectedTenant, setSelectedTenant] = useState(null);
    const [collapsedFloors, setCollapsedFloors] = useState(new Set());
    const [tenantSearch, setTenantSearch] = useState('');
    const [rooms, setRooms] = useState([]);
    const [utilityRates, setUtilityRates] = useState({
        electricity: 7, // Baht per unit
        water: 18,      // Baht per unit
        baseRent: 0     // Monthly rent
    });
    const [fixedExpenses, setFixedExpenses] = useState([
        { name: 'ค่าจอดรถ', amount: 0 },
        { name: 'WiFi', amount: 0 }
    ]);
    const [newExpenseName, setNewExpenseName] = useState('');
    const [newExpenseAmount, setNewExpenseAmount] = useState('');
    const [selectedRoles, setSelectedRoles] = useState({});
    const [selectedRooms, setSelectedRooms] = useState({});
    const [maintenanceRequests, setMaintenanceRequests] = useState([]);
    const [requestToApprove, setRequestToApprove] = useState(null);
    const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
    const [approvalRoom, setApprovalRoom] = useState(null);
    const [approvalExpenses, setApprovalExpenses] = useState([]);
    const [approvalAmenities, setApprovalAmenities] = useState([]);
    const [approvalWaterMeter, setApprovalWaterMeter] = useState(0);
    const [approvalElecMeter, setApprovalElecMeter] = useState(0);

    useEffect(() => {
        async function loadData() {
            if (!user) return;
            try {
                // Fetch profile
                const profileRef = doc(db, 'users', user.uid);
                const profileSnap = await getDoc(profileRef);
                if (profileSnap.exists()) {
                    setProfile(profileSnap.data());
                }

                const apps = await getUserApartments(db, user);
                setApartments(apps);

                const currentId = localStorage.getItem('activeApartmentId');

                if (currentId === 'all' && !isAddMode) {
                    setLoading(false);
                    return;
                }

                const currentApt = apps.find(a => a.id === currentId);
                if (currentApt) {
                    setGeneralInfo(currentApt.general || { name: '', address: '', phone: '', logoURL: '' });
                    setBankDetails(currentApt.bankDetails || { name: '', accountName: '', accountNo: '', promptpay: '' });
                    setFloors(currentApt.floors || [{ id: 1, roomCount: 5 }]);
                    setAmenities(currentApt.amenities || amenities);
                    setManagers(currentApt.managers || []);
                    setUtilityRates(currentApt.utilityRates || { electricity: 7, water: 18, baseRent: 0 });
                    setFixedExpenses(currentApt.fixedExpenses || [
                        { name: 'ค่าจอดรถ', amount: 0 },
                        { name: 'WiFi', amount: 0 }
                    ]);

                    // Fetch rooms
                    const roomsQ = query(collection(db, 'rooms'), where('apartmentId', '==', currentId));
                    const roomsSnap = await getDocs(roomsQ);
                    const firestoreRooms = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                    // Generate all rooms (merging firestore data)
                    const generated = [];
                    if (currentApt.floors) {
                        currentApt.floors.forEach(floor => {
                            for (let i = 1; i <= floor.roomCount; i++) {
                                const roomNo = `${floor.id}${i.toString().padStart(2, '0')}`;
                                const existing = firestoreRooms.find(r => r.roomNumber === roomNo);
                                generated.push(existing || {
                                    roomNumber: roomNo,
                                    floor: floor.id,
                                    status: 'ว่าง',
                                    apartmentId: currentId,
                                    price: currentApt.utilityRates?.baseRent || 0
                                });
                            }
                        });
                    }
                    setRooms(generated);

                    // Requests will be fetched by onSnapshot useEffect below

                    // Fetch actual staff members and tenants
                    const staffAndTenantsQ = query(
                        collection(db, 'users'),
                        where(`apartmentRoles.${currentId}.role`, 'in', ['staff', 'manager', 'tenant'])
                    );
                    const staffAndTenantsSnap = await getDocs(staffAndTenantsQ);
                    const loadedStaff = [];
                    const loadedTenants = [];
                    staffAndTenantsSnap.docs.forEach(d => {
                        const userData = { id: d.id, ...d.data() };
                        const role = userData.apartmentRoles[currentId].role;
                        if (role === 'manager' || role === 'staff') {
                            loadedStaff.push(userData);
                        } else if (role === 'tenant') {
                            loadedTenants.push(userData);
                        }
                    });
                    setStaffMembers(loadedStaff);
                    setTenants(loadedTenants);
                }
            } catch (error) {
                console.error(error);
                showToast('โหลดข้อมูลล้มเหลว', 'error');
            }
            setLoading(false);
        }
        loadData();
    }, [user, activeAptId, isAddMode]);

    useEffect(() => {
        if (!user || !activeAptId || activeAptId === 'all') {
            setRequests([]);
            return;
        }

        const reqQ = query(
            collection(db, 'requests'),
            where('apartmentId', '==', activeAptId),
            where('status', '==', 'pending')
        );

        const unsubscribe = onSnapshot(reqQ, async (snap) => {
            const reqData = [];
            for (const d of snap.docs) {
                const request = { id: d.id, ...d.data() };
                let userName = 'Unknown User';
                let roomName = `Room ${request.roomNumber || '?'}`;

                try {
                    const userSnap = await getDoc(doc(db, 'users', request.userId));
                    if (userSnap.exists()) {
                        const uData = userSnap.data();
                        userName = uData.name || uData.displayName || 'Unnamed User';
                    }

                    if (request.roomId) {
                        const roomSnap = await getDoc(doc(db, 'rooms', request.roomId));
                        if (roomSnap.exists()) roomName = roomSnap.data().roomNumber;
                    }
                } catch (err) {
                    console.warn("Failed to fetch details for request:", request.id, err);
                }

                reqData.push({
                    ...request,
                    userName,
                    roomName
                });
            }
            setRequests(reqData);
        });

        return () => unsubscribe();
    }, [user, activeAptId]);

    useEffect(() => {
        if (!user || !activeAptId || activeAptId === 'all') {
            setMaintenanceRequests([]);
            return;
        }

        const maintQ = query(
            collection(db, 'maintenance'),
            where('apartmentId', '==', activeAptId)
        );

        const unsubscribe = onSnapshot(maintQ, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
            setMaintenanceRequests(data);
        });

        return () => unsubscribe();
    }, [user, activeAptId]);

    const handleLogoChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast('ขนาดรูปภาพต้องไม่เกิน 2MB', 'error');
            return;
        }

        setUploadingLogo(true);
        try {
            const storageRef = ref(storage2, `shop-logos/${user.uid}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            setGeneralInfo(prev => ({ ...prev, logoURL: downloadURL }));
            showToast('อัปโหลดโลโก้เรียบร้อย', 'success');
        } catch (error) {
            console.error('Error uploading logo:', error);
            showToast('อัปโหลดโลโก้ล้มเหลว', 'error');
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleCopyLoginLink = () => {
        if (!activeAptId || activeAptId === 'all') return;
        const link = `${window.location.origin}/tenant-login?aptId=${activeAptId}`;
        navigator.clipboard.writeText(link);
        showToast('คัดลอกลิงก์หน้าล็อกอินแล้ว', 'success');
    };

    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
        showToast('สลับตึกเรียบร้อย');
    };

    const handleSave = async () => {
        if (!generalInfo.name.trim()) {
            showToast('กรุณาระบุชื่อหอพัก', 'error');
            return;
        }

        setSaving(true);
        try {
            const data = {
                ownerId: user.uid,
                general: generalInfo,
                bankDetails: bankDetails,
                floors,
                amenities,
                managers,
                utilityRates,
                fixedExpenses,
                updatedAt: serverTimestamp()
            };

            if (isAddMode) {
                const docRef = await addDoc(collection(db, 'apartments'), {
                    ...data,
                    createdAt: serverTimestamp()
                });
                showToast('สร้างหอพักใหม่เรียบร้อย');
                localStorage.setItem('activeApartmentId', docRef.id);
                navigate('/dashboard');
            } else {
                await updateDoc(doc(db, 'apartments', activeAptId), data);
                setApartments(apartments.map(a => a.id === activeAptId ? { ...a, ...data } : a));
                showToast('บันทึกข้อมูลเรียบร้อย');
            }
        } catch (error) {
            console.error(error);
            showToast('บันทึกล้มเหลว', 'error');
        }
        setSaving(false);
    };

    const handleApproveRequest = async (request) => {
        setSaving(true);
        try {
            if (request.type === 'staff') {
                const userRef = doc(db, 'users', request.userId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    const newApartmentRoles = {
                        ...userData.apartmentRoles,
                        [request.apartmentId]: {
                            role: selectedRoles[request.id] || 'manager',
                            joinedAt: serverTimestamp()
                        }
                    };
                    await updateDoc(userRef, { apartmentRoles: newApartmentRoles });

                    const aptRef = doc(db, 'apartments', request.apartmentId);
                    const aptSnap = await getDoc(aptRef);
                    if (aptSnap.exists()) {
                        const aptData = aptSnap.data();
                        const aptManagers = aptData.managers || [];
                        const staffEmailOrPhone = request.userEmail || request.userPhone || '';
                        if (staffEmailOrPhone && !aptManagers.includes(staffEmailOrPhone)) {
                            await updateDoc(aptRef, { managers: [...aptManagers, staffEmailOrPhone] });
                            setManagers(prev => [...prev, staffEmailOrPhone]);
                        }
                    }

                    setStaffMembers(prev => [...prev, {
                        ...userData,
                        id: request.userId,
                        apartmentRoles: newApartmentRoles
                    }]);
                }
            } else {
                let roomId = request.roomId;
                let roomNumber = request.roomNumber;

                if (!roomId) {
                    // Use room from approval modal or request
                    roomNumber = approvalRoom?.roomNumber || selectedRooms[request.id] || request.roomNumber;
                    if (!roomNumber) throw new Error("Please select a room first");

                    const selectedRoomObj = rooms.find(r => r.roomNumber === roomNumber);
                    if (selectedRoomObj && selectedRoomObj.id) {
                        roomId = selectedRoomObj.id;
                    } else if (selectedRoomObj) {
                        // Create room if it doesn't exist in firestore
                        const newRoomRef = await addDoc(collection(db, 'rooms'), {
                            ...selectedRoomObj,
                            tenantId: request.userId,
                            tenantName: request.userName,
                            status: 'ไม่ว่าง',
                            price: selectedRoomObj.price || utilityRates.baseRent || 0,
                            waterMeter: parseFloat(approvalWaterMeter) || 0,
                            electricityMeter: parseFloat(approvalElecMeter) || 0,
                            fixedExpenses: approvalExpenses,
                            amenities: approvalAmenities,
                            updatedAt: serverTimestamp()
                        });
                        roomId = newRoomRef.id;
                    }
                }

                if (roomId) {
                    await updateDoc(doc(db, 'rooms', roomId), {
                        tenantId: request.userId,
                        tenantName: request.userName,
                        status: 'ไม่ว่าง',
                        price: rooms.find(r => r.roomNumber === roomNumber)?.price || utilityRates.baseRent || 0,
                        waterMeter: parseFloat(approvalWaterMeter) || 0,
                        electricityMeter: parseFloat(approvalElecMeter) || 0,
                        fixedExpenses: approvalExpenses,
                        amenities: approvalAmenities,
                        updatedAt: serverTimestamp()
                    });
                }

                const userRef = doc(db, 'users', request.userId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    const newApartmentRoles = {
                        ...userData.apartmentRoles,
                        [request.apartmentId]: {
                            role: request.role || 'tenant',
                            roomId: roomId,
                            roomNumber: roomNumber,
                            joinedAt: serverTimestamp()
                        }
                    };
                    await updateDoc(userRef, { apartmentRoles: newApartmentRoles });
                }
            }

            await updateDoc(doc(db, 'requests', request.id), {
                status: 'approved',
                updatedAt: serverTimestamp()
            });

            setRequests(prev => prev.filter(req => req.id !== request.id));
            showToast('อนุมัติคำขอเรียบร้อย', 'success');
        } catch (error) {
            console.error('Error approving request:', error);
            showToast('อนุมัติคำขอล้มเหลว', 'error');
        }
        setSaving(false);
    };

    const handleRejectRequest = async (requestId) => {
        setSaving(true);
        try {
            await updateDoc(doc(db, 'requests', requestId), {
                status: 'rejected',
                updatedAt: serverTimestamp()
            });

            setRequests(prev => prev.filter(req => req.id !== requestId));
            showToast('ปฏิเสธคำขอเรียบร้อย', 'info');
        } catch (error) {
            console.error('Error rejecting request:', error);
            showToast('ปฏิเสธคำขอล้มเหลว', 'error');
        }
        setSaving(false);
    };

    const handleUpdateMaintenanceStatus = async (requestId, newStatus) => {
        try {
            await updateDoc(doc(db, 'maintenance', requestId), {
                status: newStatus,
                updatedAt: serverTimestamp()
            });
            showToast('อัปเดตสถานะแจ้งซ่อมเรียบร้อย', 'success');
        } catch (error) {
            console.error('Error updating maintenance status:', error);
            showToast('อัปเดตสถานะล้มเหลว', 'error');
        }
    };

    const currentApt = apartments.find(a => a.id === activeAptId);
    const isOwner = isAddMode || currentApt?.ownerId === user?.uid;

    const handleResetPassword = async (email) => {
        if (!email) {
            showToast('ไม่พบอีเมลพนักงาน', 'error');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            showToast('ส่งลิงก์รีเช็ตรหัสผ่านไปยังอีเมลพนักงานแล้ว', 'success');
        } catch (error) {
            console.error(error);
            showToast('ส่งลิงก์รีเช็ตรหัสผ่านล้มเหลว', 'error');
        }
    };

    const handleRemoveStaff = async (staffId) => {
        if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบพนักงานคนนี้ออกจากหอพัก?')) return;

        try {
            const staffRef = doc(db, 'users', staffId);
            await updateDoc(staffRef, {
                [`apartmentRoles.${activeAptId}`]: deleteField()
            });
            setStaffMembers(prev => prev.filter(s => s.id !== staffId));
            showToast('ลบพนักงานออกจากระบบแล้ว', 'success');
        } catch (error) {
            console.error('Error removing staff:', error);
            showToast('ลบพนักงานล้มเหลว', 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const headerTitle = ['staff', 'requests', 'tenants', 'maintenance_tab'].includes(activeTab)
        ? (activeTab === 'staff' ? 'พนักงาน' : (activeTab === 'tenants' ? 'ผู้เช่า' : (activeTab === 'requests' ? 'คำขอเข้าร่วม' : 'แจ้งซ่อม')))
        : 'ตั้งค่าระบบ';

    return (
        <MainLayout
            profile={profile}
            apartments={apartments}
            activeAptId={activeAptId}
            onAptSwitch={handleAptSwitch}
            title={headerTitle}
        >
            <Toast {...toast} onClose={hideToast} />

            <header className="h-14 flex items-center justify-end px-6 lg:px-5 bg-brand-bg/40 backdrop-blur-md sticky top-0 z-40">
                <button
                    onClick={handleSave}
                    disabled={saving || (!isAddMode && activeAptId === 'all') || (!isAddMode && activeAptId !== 'all' && !isOwner && activeTab === 'staff')}
                    className={`px-6 h-10 rounded-xl flex items-center shadow-md active:scale-95 transition-all disabled:opacity-50 ${(!isAddMode && !isOwner && activeTab === 'staff') ? 'bg-brand-gray-700 text-white cursor-not-allowed' : 'bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg shadow-brand-orange-500/20'}`}
                >
                    <Save className="w-4 h-4 md:mr-2" />
                    <span className="hidden md:block font-bold text-xs">{saving ? 'บันทึก...' : 'บันทึกข้อมูล'}</span>
                </button>
            </header>

            {!['staff', 'requests', 'tenants', 'maintenance_tab'].includes(activeTab) && (
                <div className="px-6 lg:px-5 pt-2 pb-0 sticky top-14 z-30 bg-brand-bg/95 backdrop-blur-md">
                    <div className="grid bg-brand-card/30 p-1 rounded-lg border border-white/5 grid-cols-4 gap-1 w-full max-w-xl mx-auto mb-2">
                        {[
                            { id: 'general', icon: <Info className="w-3.5 h-3.5 mr-1.5" />, label: 'ทั่วไป' },
                            { id: 'rooms', icon: <Layers className="w-3.5 h-3.5 mr-1.5" />, label: 'ห้องพัก' },
                            { id: 'amenities', icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />, label: 'แม่แบบ' },
                            { id: 'expenses', icon: <CreditCard className="w-3.5 h-3.5 mr-1.5" />, label: 'ค่าใช้จ่าย' },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                className={`flex items-center justify-center py-2 rounded-md font-bold text-xs transition-all relative ${activeTab === t.id ? 'bg-white/10 text-white shadow-sm border border-white/10' : 'text-brand-gray-500 hover:text-white hover:bg-white/5 border border-transparent'}`}
                            >
                                {t.icon} <span className="hidden sm:inline">{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="px-6 lg:px-5 py-5 max-w-5xl mx-auto w-full">
                <div className="bg-brand-card border border-white/10 rounded-xl p-5 md:p-5 shadow-lg relative overflow-hidden min-h-[60vh]">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-brand-orange-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2"></div>

                    {(activeAptId === 'all' && !isAddMode) ? (
                        <div className="text-center py-16">
                            <Building className="w-10 h-10 text-brand-gray-600 mx-auto mb-6" />
                            <h3 className="text-xl font-bold text-white mb-1 uppercase tracking-tight">กรุณาเลือกตึก</h3>
                            <p className="text-brand-gray-500 font-bold text-sm uppercase tracking-widest leading-relaxed max-w-sm mx-auto">เลือกอาคารที่คุณต้องการจัดการเพื่อเข้าถึงการตั้งค่า</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'general' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-6">
                                            <div className="flex items-center mb-2">
                                                <Info className="w-5 h-5 text-brand-orange-500 mr-2" strokeWidth={3} />
                                                <h3 className="text-lg font-bold text-white uppercase tracking-tight">ข้อมูลพื้นฐาน</h3>
                                            </div>

                                            {/* Apartment Logo Upload */}
                                            <div className="bg-brand-bg/50 border border-white/10 rounded-2xl p-6 mb-6">
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="relative group">
                                                        <div className="w-24 h-24 bg-brand-card rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-brand-orange-500/50">
                                                            {generalInfo.logoURL ? (
                                                                <img src={generalInfo.logoURL} alt="Apartment Logo" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Building className="w-8 h-8 text-brand-gray-700" />
                                                            )}
                                                            {uploadingLogo && (
                                                                <div className="absolute inset-0 bg-brand-bg/60 backdrop-blur-sm flex items-center justify-center">
                                                                    <Loader2 className="w-6 h-6 text-brand-orange-500 animate-spin" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <label className="absolute -bottom-2 -right-2 w-8 h-8 bg-brand-orange-500 rounded-xl flex items-center justify-center text-brand-bg cursor-pointer shadow-lg active:scale-95 transition-all">
                                                            <PlusSquare size={16} />
                                                            <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} disabled={uploadingLogo} />
                                                        </label>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-xs font-bold text-white uppercase tracking-wider mb-1">โลโก้หอพัก</p>
                                                        <p className="text-[10px] text-brand-gray-500 font-medium leading-relaxed mb-3">ใช้สำหรับแสดงในหน้านำทางและหน้าล็อกอิน</p>

                                                        {activeAptId !== 'all' && (
                                                            <button
                                                                onClick={handleCopyLoginLink}
                                                                className="flex items-center mx-auto px-3 py-1.5 bg-brand-orange-500/10 text-brand-orange-500 rounded-lg hover:bg-brand-orange-500/20 transition-all text-[10px] font-bold border border-brand-orange-500/20"
                                                            >
                                                                <LinkIcon size={12} className="mr-1.5" />
                                                                คัดลอกลิงก์หน้า Login หอพัก
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-xs font-medium text-brand-gray-300 ml-2 mb-2 block">ชื่อหอพัก / อพาร์ทเม้นท์</label>
                                                    <input
                                                        type="text"
                                                        value={generalInfo.name}
                                                        onChange={(e) => setGeneralInfo({ ...generalInfo, name: e.target.value })}
                                                        className="w-full bg-brand-bg rounded-xl px-6 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all placeholder:text-white/10"
                                                        placeholder="ชื่อโครงการ..."
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-brand-gray-300 ml-2 mb-2 block">เบอร์โทรศัพท์ติดต่อ</label>
                                                    <div className="relative">
                                                        <Phone className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-500" />
                                                        <input
                                                            type="text"
                                                            value={generalInfo.phone}
                                                            onChange={(e) => setGeneralInfo({ ...generalInfo, phone: e.target.value })}
                                                            className="w-full bg-brand-bg rounded-xl pl-14 pr-6 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all"
                                                            placeholder="08X-XXX-XXXX"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-brand-gray-300 ml-2 mb-2 block">ที่อยู่โครงการ</label>
                                                    <div className="relative">
                                                        <MapPin className="absolute left-6 top-5 w-4 h-4 text-brand-gray-500" />
                                                        <textarea
                                                            value={generalInfo.address}
                                                            onChange={(e) => setGeneralInfo({ ...generalInfo, address: e.target.value })}
                                                            rows="3"
                                                            className="w-full bg-brand-bg rounded-xl pl-14 pr-6 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all resize-none"
                                                            placeholder="เลขที่, ตำบล, อำเภอ..."
                                                        ></textarea>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <div className="flex items-center mb-2">
                                                <CreditCard className="w-5 h-5 text-brand-orange-500 mr-2" strokeWidth={3} />
                                                <h3 className="text-lg font-bold text-white uppercase tracking-tight">ข้อมูลการชำระเงิน</h3>
                                            </div>

                                            {!isOwner ? (
                                                <div className="bg-brand-bg/50 border border-white/10 rounded-xl p-4 text-center">
                                                    <p className="text-brand-gray-400 font-bold text-sm">คุณไม่มีสิทธิ์เข้าถึงหรือแก้ไขข้อมูลส่วนนี้</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="text-xs font-medium text-brand-gray-300 ml-2 mb-2 block">ชื่อธนาคาร</label>
                                                        <input
                                                            type="text"
                                                            value={bankDetails.name}
                                                            onChange={(e) => setBankDetails({ ...bankDetails, name: e.target.value })}
                                                            className="w-full bg-brand-bg rounded-xl px-6 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all tracking-wide"
                                                            placeholder="เช่น กสิกรไทย, ไทยพาณิชย์..."
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-xs font-medium text-brand-gray-300 ml-2 mb-2 block">ชื่อบัญชี</label>
                                                            <input
                                                                type="text"
                                                                value={bankDetails.accountName}
                                                                onChange={(e) => setBankDetails({ ...bankDetails, accountName: e.target.value })}
                                                                className="w-full bg-brand-bg rounded-xl px-6 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all"
                                                                placeholder="นาย สมชาย..."
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-medium text-brand-gray-300 ml-2 mb-2 block">เลขที่บัญชี</label>
                                                            <input
                                                                type="text"
                                                                value={bankDetails.accountNo}
                                                                onChange={(e) => setBankDetails({ ...bankDetails, accountNo: e.target.value })}
                                                                className="w-full bg-brand-bg rounded-xl px-6 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all font-mono"
                                                                placeholder="XXX-X-XXXXX-X"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-brand-gray-300 ml-2 mb-2 block">เบอร์พร้อมเพย์ (ถ้ามี)</label>
                                                        <input
                                                            type="text"
                                                            value={bankDetails.promptpay}
                                                            onChange={(e) => setBankDetails({ ...bankDetails, promptpay: e.target.value })}
                                                            className="w-full bg-brand-bg rounded-xl px-6 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all"
                                                            placeholder="08X-XXX-XXXX"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'rooms' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-base font-bold text-white uppercase tracking-tight">กำหนดชั้นและห้องพัก</h3>
                                            <p className="text-brand-gray-400 text-xs mt-0.5">เพิ่มชั้นและระบุจำนวนห้องในแต่ละชั้น</p>
                                        </div>
                                        <button
                                            onClick={() => setFloors([...floors, { id: floors.length + 1, roomCount: 5 }])}
                                            className="flex items-center px-3 py-2 bg-brand-orange-500/10 text-brand-orange-500 rounded-xl hover:bg-brand-orange-500/20 transition-all active:scale-90 text-xs font-bold"
                                        >
                                            <Plus className="w-4 h-4 mr-1" /> เพิ่มชั้น
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {floors.map((floor, index) => (
                                            <div key={floor.id} className="flex items-center justify-between px-4 py-3 bg-brand-bg rounded-xl border border-white/10 hover:border-brand-orange-500/30 transition-all group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 bg-white/5 rounded-lg flex items-center justify-center text-sm font-bold text-brand-orange-500 group-hover:bg-brand-orange-500 group-hover:text-brand-bg transition-all">
                                                        {floor.id}
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-bold text-sm">ชั้น {floor.id}</p>
                                                        <p className="text-brand-gray-400 text-xs">{floor.roomCount} ห้อง</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-brand-gray-500 mr-1">จำนวนห้อง</span>
                                                    <input
                                                        type="number"
                                                        value={floor.roomCount}
                                                        onChange={(e) => {
                                                            const nf = [...floors];
                                                            nf[index].roomCount = parseInt(e.target.value) || 0;
                                                            setFloors(nf);
                                                        }}
                                                        className="w-16 bg-brand-card rounded-lg px-3 py-1.5 border border-white/10 outline-none font-bold text-brand-orange-500 text-center text-sm"
                                                    />
                                                    <button onClick={() => setFloors(floors.filter(f => f.id !== floor.id))} className="p-1.5 text-brand-gray-600 hover:text-red-400 transition-colors">
                                                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {floors.length === 0 && (
                                        <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
                                            <p className="text-brand-gray-500 text-sm font-bold">ยังไม่มีชั้นใดๆ</p>
                                            <p className="text-brand-gray-600 text-xs mt-1">กดปุ่ม "เพิ่มชั้น" เพื่อเริ่มต้น</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'amenities' && (
                                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-xl font-bold text-white uppercase tracking-tight">ตัวเลือกสิ่งอำนวยความสะดวก</h3>
                                            <p className="text-brand-gray-400 text-xs font-medium mt-1">แม่แบบสิ่งอำนวยความสะดวก</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2.5">
                                        {amenities.map((item, index) => (
                                            <div key={index} className="flex items-center bg-brand-bg px-5 py-2.5 rounded-full border border-white/10 group hover:border-brand-orange-500/50 transition-all">
                                                <span className="text-sm font-bold text-white mr-3">{item.name}</span>
                                                <button onClick={() => setAmenities(amenities.filter((_, i) => i !== index))} className="text-brand-gray-600 hover:text-red-500">
                                                    <Plus className="w-4 h-4 rotate-45" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="pt-4 flex items-center space-x-3">
                                        <input
                                            type="text"
                                            value={newAmenityName}
                                            onChange={(e) => setNewAmenityName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && newAmenityName.trim()) {
                                                    setAmenities([...amenities, { name: newAmenityName.trim(), status: false }]);
                                                    setNewAmenityName('');
                                                }
                                            }}
                                            className="flex-1 bg-brand-bg rounded-xl px-6 py-2.5 border border-white/10 outline-none font-bold text-white placeholder:text-white/10"
                                            placeholder="ความสะดวกใหม่ (เช่น พัดลม, แอร์)..."
                                        />
                                        <button
                                            onClick={() => {
                                                if (newAmenityName.trim()) {
                                                    setAmenities([...amenities, { name: newAmenityName.trim(), status: false }]);
                                                    setNewAmenityName('');
                                                }
                                            }}
                                            className="bg-brand-orange-500 text-brand-bg px-5 h-12 rounded-xl font-bold uppercase tracking-[0.1em] text-xs hover:bg-brand-orange-400 active:scale-95 transition-all shadow-md shadow-brand-orange-500/20"
                                        >
                                            เพิ่มรายการ
                                        </button>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'expenses' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {/* Monthly Rent */}
                                    <div className="space-y-4">
                                        <div className="flex items-center space-x-3 mb-2">
                                            <div className="w-8 h-8 bg-brand-orange-500/10 rounded-lg flex items-center justify-center">
                                                <Building className="w-4 h-4 text-brand-orange-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-white uppercase tracking-tight">ค่าเช่าหลัก</h3>
                                                <p className="text-brand-gray-300 text-[11px] font-medium">กำหนดค่าเช่าเริ่มต้นต่อเดือนสำหรับทุกห้อง</p>
                                            </div>
                                        </div>
                                        <div className="bg-brand-card/30 border border-white/5 p-4 rounded-2xl group hover:border-brand-orange-500/30 transition-all">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-[11px] font-black text-brand-gray-400 uppercase tracking-widest">ค่าเช่ารายเดือน (บาท)</span>
                                                <Building className="w-3.5 h-3.5 text-brand-orange-500" />
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={utilityRates.baseRent || ''}
                                                    onChange={(e) => setUtilityRates({ ...utilityRates, baseRent: parseFloat(e.target.value) || 0 })}
                                                    className="w-full bg-brand-bg/50 rounded-xl px-4 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all text-lg text-center font-mono"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Utility Rates */}
                                    <div className="space-y-4">
                                        <div className="flex items-center space-x-3 mb-2">
                                            <div className="w-8 h-8 bg-brand-orange-500/10 rounded-lg flex items-center justify-center">
                                                <Zap className="w-4 h-4 text-brand-orange-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-white uppercase tracking-tight">ค่าน้ำ-ค่าไฟ</h3>
                                                <p className="text-brand-gray-300 text-[11px] font-medium">กำหนดราคาต่อหน่วยสำหรับการคำนวณบิล</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="bg-brand-card/30 border border-white/5 p-4 rounded-2xl group hover:border-brand-orange-500/30 transition-all">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-[11px] font-black text-brand-gray-400 uppercase tracking-widest">ค่าไฟฟ้า (บาท/หน่วย)</span>
                                                    <Zap className="w-3.5 h-3.5 text-yellow-500" />
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        value={utilityRates.electricity}
                                                        onChange={(e) => setUtilityRates({ ...utilityRates, electricity: parseFloat(e.target.value) || 0 })}
                                                        className="w-full bg-brand-bg/50 rounded-xl px-4 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all text-lg text-center font-mono"
                                                    />
                                                </div>
                                            </div>

                                            <div className="bg-brand-card/30 border border-white/5 p-4 rounded-2xl group hover:border-brand-orange-500/30 transition-all">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-[11px] font-black text-brand-gray-400 uppercase tracking-widest">ค่าน้ำ (บาท/หน่วย)</span>
                                                    <Droplets className="w-3.5 h-3.5 text-blue-500" />
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        value={utilityRates.water}
                                                        onChange={(e) => setUtilityRates({ ...utilityRates, water: parseFloat(e.target.value) || 0 })}
                                                        className="w-full bg-brand-bg/50 rounded-xl px-4 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all text-lg text-center font-mono"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Fixed Expenses */}
                                    <div className="space-y-4 pt-4 border-t border-white/5">
                                        <div className="flex items-center space-x-3 mb-2">
                                            <div className="w-8 h-8 bg-brand-orange-500/10 rounded-lg flex items-center justify-center">
                                                <CreditCard className="w-4 h-4 text-brand-orange-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-white uppercase tracking-tight">ค่าบริการเพิ่มเติม</h3>
                                                <p className="text-brand-gray-300 text-[11px] font-medium">ตั้งค่าบริการเสริมคงที่ต่อเดือน เช่น WiFi, ที่จอดรถ</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-2">
                                            {fixedExpenses.map((expense, index) => (
                                                <div key={index} className="flex items-center justify-between bg-brand-bg/50 px-4 py-3 rounded-xl border border-white/5 group hover:border-brand-orange-500/30 transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 bg-white/5 rounded-lg flex items-center justify-center text-brand-gray-500 group-hover:bg-brand-orange-500/20 group-hover:text-brand-orange-500 transition-all">
                                                            <PlusSquare className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <p className="text-white font-bold text-sm">{expense.name}</p>
                                                            <p className="text-[11px] font-bold text-brand-gray-300 uppercase tracking-widest">{expense.amount.toLocaleString()} บาท/เดือน</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                value={expense.amount}
                                                                onChange={(e) => {
                                                                    const ne = [...fixedExpenses];
                                                                    ne[index].amount = parseFloat(e.target.value) || 0;
                                                                    setFixedExpenses(ne);
                                                                }}
                                                                className="w-20 bg-brand-card rounded-lg px-2 py-1.5 border border-white/10 outline-none font-bold text-brand-orange-500 text-center text-xs"
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => setFixedExpenses(fixedExpenses.filter((_, i) => i !== index))}
                                                            className="p-1.5 text-brand-gray-600 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="bg-brand-card/30 p-4 rounded-2xl border border-white/5 space-y-4">
                                            <p className="text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em] ml-1">เพิ่มรายการใหม่</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newExpenseName}
                                                    onChange={(e) => setNewExpenseName(e.target.value)}
                                                    className="flex-[2] bg-brand-bg rounded-xl px-4 py-2 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all text-xs"
                                                    placeholder="เช่น WiFi, ค่าส่วนกลาง..."
                                                />
                                                <input
                                                    type="number"
                                                    value={newExpenseAmount}
                                                    onChange={(e) => setNewExpenseAmount(e.target.value)}
                                                    className="flex-1 bg-brand-bg rounded-xl px-4 py-2 border border-white/10 outline-none font-bold text-brand-orange-500 focus:border-brand-orange-500/50 transition-all text-xs text-center"
                                                    placeholder="บาท"
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (newExpenseName.trim()) {
                                                            setFixedExpenses([...fixedExpenses, {
                                                                name: newExpenseName.trim(),
                                                                amount: parseFloat(newExpenseAmount) || 0
                                                            }]);
                                                            setNewExpenseName('');
                                                            setNewExpenseAmount('');
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-brand-orange-500 text-brand-bg rounded-xl font-bold text-xs hover:bg-brand-orange-400 transition-all"
                                                >
                                                    เพิ่ม
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'staff' && (
                                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="flex items-center justify-between mb-5">
                                        <div>
                                            <h3 className="text-xl font-bold text-white uppercase tracking-tight">การจัดการทีมงาน</h3>
                                            <p className="text-brand-gray-400 text-xs font-medium mt-1">จัดการสิทธิ์และรับสมัครพนักงานใหม่</p>
                                        </div>
                                    </div>

                                    {activeAptId && activeAptId !== 'all' && (
                                        <div className="bg-brand-orange-500/10 border border-brand-orange-500/20 rounded-xl p-5 mb-5 flex flex-col md:flex-row items-center gap-6">
                                            <div className="bg-white p-3 rounded-xl shadow-lg border-2 border-brand-orange-500">
                                                <QRCodeSVG
                                                    value={`${window.location.origin}/join-staff/${activeAptId}`}
                                                    size={110}
                                                    level={"H"}
                                                />
                                            </div>
                                            <div className="flex-1 text-center md:text-left">
                                                <h4 className="text-white font-bold text-lg mb-2 flex items-center justify-center md:justify-start">
                                                    <QrCode className="w-5 h-5 mr-2 text-brand-orange-500" />
                                                    คิวอาร์โค้ดรับสมัครพนักงาน
                                                </h4>
                                                <p className="text-brand-gray-400 text-xs mb-4">
                                                    ให้บุคลากรแสกน QR Code นี้เพื่อเริ่มขั้นตอนการลงทะเบียนและส่งคำขอเข้าร่วมทีมงาน
                                                </p>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(`${window.location.origin}/join-staff/${activeAptId}`);
                                                        showToast('คัดลอกลิงก์รับสมัครแล้ว', 'success');
                                                    }}
                                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-[11px] font-bold transition-all inline-flex items-center tracking-wide"
                                                >
                                                    <ClipboardList className="w-4 h-4 mr-2" /> คัดลอกลิงก์รับสมัคร
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        {staffMembers.map((staff, index) => {
                                            const role = staff.apartmentRoles?.[activeAptId]?.role === 'manager' ? 'ผู้จัดการ' : 'พนักงานทั่วไป';
                                            return (
                                                <div key={staff.id || index} className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-brand-bg/50 group hover:border-brand-orange-500/30 transition-all">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-brand-orange-500/20 rounded-xl flex items-center justify-center text-brand-orange-500 group-hover:scale-110 transition-transform">
                                                            <User className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-white font-bold text-sm leading-none mb-1">{staff.name || staff.displayName || staff.email || staff.phone}</h4>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="flex items-center text-[11px] font-bold text-brand-orange-500 tracking-wide bg-brand-orange-500/10 px-2 py-0.5 rounded-md border border-brand-orange-500/20">
                                                                    {role}
                                                                </span>
                                                                <span className="text-[11px] font-bold text-brand-gray-300">{staff.phone || staff.email}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleResetPassword(staff.email)}
                                                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-[10px] font-bold transition-all active:scale-95"
                                                        >
                                                            รีเช็ต
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveStaff(staff.id)}
                                                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                                                        >
                                                            ลบออก
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {staffMembers.length === 0 && (
                                            <p className="text-center py-10 text-brand-gray-500 font-bold text-sm">ยังไม่มีพนักงานในตึกนี้</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'tenants' && (() => {
                                // Build floor->tenants map
                                const floorMap = {};
                                floors.forEach(fl => { floorMap[fl.id] = []; });
                                tenants.forEach(tenant => {
                                    const role = tenant.apartmentRoles?.[activeAptId];
                                    if (!role) return;
                                    const roomNum = role.roomNumber || '';
                                    const roomObj = rooms.find(r => r.roomNumber === roomNum);
                                    const floorId = roomObj?.floor || (roomNum ? parseInt(roomNum.toString()[0]) : null);
                                    if (floorId && floorMap[floorId] !== undefined) {
                                        floorMap[floorId].push({ ...tenant, roomNumber: roomNum, roomObj });
                                    } else if (floorId) {
                                        floorMap[floorId] = [{ ...tenant, roomNumber: roomNum, roomObj }];
                                    }
                                });

                                const sq = tenantSearch.trim().toLowerCase();
                                const occupiedCount = tenants.length;
                                const totalRooms = rooms.length;

                                const toggleFloor = (id) => {
                                    setCollapsedFloors(prev => {
                                        const next = new Set(prev);
                                        next.has(id) ? next.delete(id) : next.add(id);
                                        return next;
                                    });
                                };

                                return (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        {/* Header row */}
                                        <div className="flex items-start justify-between mb-4">
                                            <div>
                                                <h3 className="text-xl font-bold text-white uppercase tracking-tight">รายชื่อผู้เช่า</h3>
                                                <p className="text-brand-gray-400 text-xs font-medium mt-1">จัดตามชั้นและห้องพัก</p>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="text-right">
                                                    <p className="text-2xl font-black text-white leading-none">{occupiedCount}<span className="text-brand-gray-500 text-sm font-bold">/{totalRooms}</span></p>
                                                    <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">ห้องมีผู้เช่า</p>
                                                </div>
                                                {activeAptId && activeAptId !== 'all' && (
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(`${window.location.origin}/join-tenant/${activeAptId}`);
                                                            showToast('คัดลอกลิงก์แล้ว', 'success');
                                                        }}
                                                        className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-[10px] font-bold transition-all inline-flex items-center gap-1.5"
                                                    >
                                                        <QrCode className="w-3.5 h-3.5" /> QR ลงทะเบียน
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Search bar */}
                                        <div className="relative mb-4">
                                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-500" />
                                            <input
                                                type="text"
                                                value={tenantSearch}
                                                onChange={e => setTenantSearch(e.target.value)}
                                                placeholder="ค้นหาชื่อ, เบอร์เลขห้อง, เบอร์โทร..."
                                                className="w-full bg-brand-bg/60 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-white placeholder:text-brand-gray-600 outline-none focus:border-brand-orange-500/50 transition-all"
                                            />
                                            {tenantSearch && (
                                                <button onClick={() => setTenantSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-500 hover:text-white transition-colors">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Main layout: list + detail panel */}
                                        <div className="flex gap-4 items-start">
                                            {/* Floor list */}
                                            <div className={`space-y-3 transition-all duration-300 ${selectedTenant ? 'w-1/2 lg:w-7/12' : 'w-full'}`}>
                                                {floors.length === 0 ? (
                                                    <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
                                                        <User className="w-8 h-8 text-brand-gray-600 mx-auto mb-3" />
                                                        <p className="text-brand-gray-500 font-bold text-sm">ยังไม่มีการตั้งค่าชั้นในอาคาร</p>
                                                    </div>
                                                ) : (
                                                    floors.map(floor => {
                                                        const floorTenants = floorMap[floor.id] || [];
                                                        const floorRooms = rooms.filter(r => r.floor === floor.id);
                                                        const allRooms = floorRooms.length > 0
                                                            ? floorRooms
                                                            : Array.from({ length: floor.roomCount }, (_, i) => ({
                                                                roomNumber: `${floor.id}${(i + 1).toString().padStart(2, '0')}`,
                                                                floor: floor.id,
                                                                status: 'ว่าง'
                                                            }));

                                                        // Filter rooms by search query
                                                        const filteredRooms = sq
                                                            ? allRooms.filter(room => {
                                                                if (room.roomNumber?.toLowerCase().includes(sq)) return true;
                                                                const t = floorTenants.find(t => t.roomNumber === room.roomNumber);
                                                                if (!t) return false;
                                                                const name = (t.name || t.displayName || '').toLowerCase();
                                                                const phone = (t.phone || '').toLowerCase();
                                                                const email = (t.email || '').toLowerCase();
                                                                return name.includes(sq) || phone.includes(sq) || email.includes(sq);
                                                            })
                                                            : allRooms;

                                                        // Hide entire floor if search returns nothing
                                                        if (sq && filteredRooms.length === 0) return null;

                                                        const isCollapsed = collapsedFloors.has(floor.id);

                                                        return (
                                                            <div key={floor.id} className="bg-brand-bg/50 border border-white/8 rounded-2xl overflow-hidden">
                                                                {/* Floor header — clickable to collapse */}
                                                                <button
                                                                    onClick={() => toggleFloor(floor.id)}
                                                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-7 h-7 bg-brand-orange-500/10 rounded-lg flex items-center justify-center shrink-0">
                                                                            <span className="text-brand-orange-500 font-black text-xs">{floor.id}</span>
                                                                        </div>
                                                                        <p className="text-white font-bold text-sm">ชั้น {floor.id}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                            {floorTenants.length}/{floorRooms.length || floor.roomCount} ห้อง
                                                                        </span>
                                                                        <ChevronDown className={`w-4 h-4 text-brand-gray-500 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                                                    </div>
                                                                </button>

                                                                {/* Room rows — collapsible */}
                                                                {!isCollapsed && (
                                                                    <div className="divide-y divide-white/5 border-t border-white/5">
                                                                        {filteredRooms.map(room => {
                                                                            const tenant = floorTenants.find(t => t.roomNumber === room.roomNumber);
                                                                            const isSelected = selectedTenant?.id === tenant?.id;
                                                                            return (
                                                                                <div
                                                                                    key={room.roomNumber}
                                                                                    onClick={() => tenant && setSelectedTenant(isSelected ? null : tenant)}
                                                                                    className={`flex items-center justify-between px-4 py-3 transition-all ${tenant
                                                                                        ? isSelected
                                                                                            ? 'bg-brand-orange-500/10 cursor-pointer'
                                                                                            : 'hover:bg-white/5 cursor-pointer'
                                                                                        : 'opacity-40'
                                                                                        }`}
                                                                                >
                                                                                    <div className="flex items-center gap-3">
                                                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 transition-all ${tenant
                                                                                            ? isSelected
                                                                                                ? 'bg-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/30'
                                                                                                : 'bg-brand-orange-500/15 text-brand-orange-400'
                                                                                            : 'bg-white/5 text-brand-gray-600'
                                                                                            }`}>
                                                                                            {room.roomNumber}
                                                                                        </div>
                                                                                        {tenant ? (
                                                                                            <div className="min-w-0">
                                                                                                <p className={`font-bold text-sm leading-none mb-1 truncate transition-colors ${isSelected ? 'text-brand-orange-400' : 'text-white'
                                                                                                    }`}>
                                                                                                    {tenant.name || tenant.displayName || 'ไม่มีชื่อ'}
                                                                                                </p>
                                                                                                <p className="text-[11px] text-brand-gray-400 font-medium truncate">
                                                                                                    {tenant.phone || tenant.email || '-'}
                                                                                                </p>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <p className="text-brand-gray-600 text-sm font-bold">ห้องว่าง</p>
                                                                                        )}
                                                                                    </div>
                                                                                    {tenant ? (
                                                                                        <div className="flex items-center gap-2 shrink-0">
                                                                                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                                                                            <span className="text-[10px] font-bold text-emerald-400 uppercase hidden sm:block">มีผู้เช่า</span>
                                                                                            {isSelected && <X className="w-3.5 h-3.5 text-brand-orange-400 ml-1" />}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-[10px] font-bold text-brand-gray-600 uppercase">ว่าง</span>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            {/* Detail panel */}
                                            {selectedTenant && (
                                                <div className="w-1/2 lg:w-5/12 sticky top-20 animate-in slide-in-from-right-4 fade-in duration-300">
                                                    <div className="bg-brand-card border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                                                        <div className="relative px-5 pt-5 pb-4 border-b border-white/5">
                                                            <button
                                                                onClick={() => setSelectedTenant(null)}
                                                                className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                                                            >
                                                                <X className="w-3.5 h-3.5 text-brand-gray-400" />
                                                            </button>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-12 h-12 bg-brand-orange-500/15 rounded-2xl flex items-center justify-center shrink-0">
                                                                    {selectedTenant.photoURL ? (
                                                                        <img src={selectedTenant.photoURL} className="w-full h-full object-cover rounded-2xl" alt="" />
                                                                    ) : (
                                                                        <User className="w-6 h-6 text-brand-orange-400" />
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <h4 className="text-white font-bold text-base leading-tight truncate">
                                                                        {selectedTenant.name || selectedTenant.displayName || 'ไม่มีชื่อ'}
                                                                    </h4>
                                                                    <div className="flex items-center gap-1.5 mt-1">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                                                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">ผู้เช่าปัจจุบัน</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="p-5 space-y-3">
                                                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                                                                <span className="text-[11px] font-bold text-brand-gray-500 uppercase tracking-wider">ห้องพัก</span>
                                                                <span className="bg-brand-orange-500/10 border border-brand-orange-500/20 text-brand-orange-400 px-3 py-1 rounded-lg text-xs font-black">ห้อง {selectedTenant.roomNumber || '-'}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                                                                <span className="text-[11px] font-bold text-brand-gray-500 uppercase tracking-wider">ชั้น</span>
                                                                <span className="text-white font-bold text-sm">{selectedTenant.roomObj?.floor || (selectedTenant.roomNumber ? selectedTenant.roomNumber.toString()[0] : '-')}</span>
                                                            </div>
                                                            {selectedTenant.phone && (
                                                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                                                    <span className="text-[11px] font-bold text-brand-gray-500 uppercase tracking-wider">โทรศัพท์</span>
                                                                    <a href={`tel:${selectedTenant.phone}`} className="text-white font-bold text-sm hover:text-brand-orange-400 transition-colors">{selectedTenant.phone}</a>
                                                                </div>
                                                            )}
                                                            {selectedTenant.email && (
                                                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                                                    <span className="text-[11px] font-bold text-brand-gray-500 uppercase tracking-wider">อีเมล</span>
                                                                    <span className="text-white font-bold text-xs truncate max-w-[60%] text-right">{selectedTenant.email}</span>
                                                                </div>
                                                            )}
                                                            {selectedTenant.apartmentRoles?.[activeAptId]?.joinedAt && (
                                                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                                                    <span className="text-[11px] font-bold text-brand-gray-500 uppercase tracking-wider">เข้าพักตั้งแต่</span>
                                                                    <span className="text-white font-bold text-sm">
                                                                        {selectedTenant.apartmentRoles[activeAptId].joinedAt?.toDate
                                                                            ? selectedTenant.apartmentRoles[activeAptId].joinedAt.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
                                                                            : '-'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {selectedTenant.roomObj?.price && (
                                                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                                                    <span className="text-[11px] font-bold text-brand-gray-500 uppercase tracking-wider">ค่าเช่า/เดือน</span>
                                                                    <span className="text-white font-bold text-sm">{selectedTenant.roomObj.price.toLocaleString()} บ.</span>
                                                                </div>
                                                            )}
                                                            {selectedTenant.roomObj?.amenities?.filter(a => a.status).length > 0 && (
                                                                <div className="pt-1">
                                                                    <p className="text-[11px] font-bold text-brand-gray-500 uppercase tracking-wider mb-2">สิ่งอำนวยความสะดวก</p>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {selectedTenant.roomObj.amenities.filter(a => a.status).map((a, i) => (
                                                                            <span key={i} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-brand-gray-300">{a.name}</span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="px-5 pb-5">
                                                            <button
                                                                onClick={() => handleResetPassword(selectedTenant.email)}
                                                                disabled={!selectedTenant.email}
                                                                className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40"
                                                            >
                                                                ส่งลิงก์รีเซ็ตรหัสผ่าน
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {tenants.length === 0 && (
                                            <div className="text-center py-10 border border-dashed border-white/10 rounded-xl mt-4">
                                                <User className="w-8 h-8 text-brand-gray-600 mx-auto mb-3" />
                                                <p className="text-brand-gray-500 font-bold text-sm">ยังไม่มีผู้เช่าลงทะเบียนในตึกนี้</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {activeTab === 'requests' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div>
                                        <h3 className="text-xl font-bold text-white uppercase tracking-tight">คำขอเข้าร่วม</h3>
                                        <p className="text-brand-gray-400 text-xs font-medium mt-1">จัดการคำขอเข้าพักและเข้าร่วมทีมงาน</p>
                                    </div>
                                    <div className="space-y-3">
                                        {requests.map((request) => (
                                            <div key={request.id} className="p-4 bg-brand-bg rounded-xl border border-white/10 hover:border-brand-orange-500/30 transition-all">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${request.type === 'staff' ? 'bg-blue-500/10 text-blue-500' : 'bg-brand-orange-500/10 text-brand-orange-500'}`}>
                                                            {request.type === 'staff' ? <User className="w-6 h-6" /> : <ClipboardList className="w-6 h-6" />}
                                                        </div>
                                                        <div>
                                                            <h4 className="text-white font-bold text-sm">{request.userName ? request.userName : (request.userEmail || request.userPhone)}</h4>
                                                            <p className="text-[11px] font-bold text-brand-gray-300 uppercase tracking-widest mt-1">
                                                                {request.type === 'staff' ? 'สมัครพนักงาน' : (request.roomNumber ? `ขอเข้าพักห้อง ${request.roomNumber}` : 'สมัครสมาชิกลงตัว')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {request.type === 'staff' ? (
                                                        <select
                                                            value={selectedRoles[request.id] || 'manager'}
                                                            onChange={(e) => setSelectedRoles({ ...selectedRoles, [request.id]: e.target.value })}
                                                            className="bg-brand-card text-brand-orange-500 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-white/10 outline-none"
                                                        >
                                                            <option value="manager">MANAGER</option>
                                                            <option value="staff">STAFF</option>
                                                        </select>
                                                    ) : !request.roomNumber && (
                                                        <select
                                                            value={selectedRooms[request.id] || ''}
                                                            onChange={(e) => setSelectedRooms({ ...selectedRooms, [request.id]: e.target.value })}
                                                            className="bg-brand-card text-brand-orange-500 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-white/10 outline-none max-w-[120px]"
                                                        >
                                                            <option value="">เลือกห้องพัก</option>
                                                            {rooms.filter(r => r.status === 'ว่าง').map(r => (
                                                                <option key={r.roomNumber} value={r.roomNumber}>ห้อง {r.roomNumber}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (request.type === 'staff') {
                                                                handleApproveRequest(request);
                                                            } else {
                                                                setRequestToApprove(request);
                                                                const initialRoomNo = request.roomNumber || selectedRooms[request.id] || '';
                                                                const initialRoom = rooms.find(r => r.roomNumber === initialRoomNo);
                                                                setApprovalRoom(initialRoom || null);
                                                                setApprovalExpenses(initialRoom?.fixedExpenses || fixedExpenses.map(fe => ({ ...fe, active: fe.name !== 'ค่าจอดรถ' })));
                                                                setApprovalAmenities(initialRoom?.amenities || amenities.map(am => ({ ...am, status: true })));
                                                                setApprovalWaterMeter(initialRoom?.waterMeter || 0);
                                                                setApprovalElecMeter(initialRoom?.electricityMeter || 0);
                                                                setIsApproveModalOpen(true);
                                                            }
                                                        }}
                                                        className="flex-1 bg-brand-orange-500 text-brand-bg py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-brand-orange-400 transition-all shadow-lg shadow-brand-orange-500/10"
                                                    >
                                                        อนุมัติ
                                                    </button>
                                                    <button
                                                        onClick={() => handleRejectRequest(request.id)}
                                                        className="flex-1 bg-white/5 text-red-500 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-red-500/10 transition-all border border-red-500/20"
                                                    >
                                                        ปฏิเสธ
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {requests.length === 0 && (
                                            <div className="text-center py-16 bg-white/5 rounded-xl border border-dashed border-white/10">
                                                <ClipboardList className="w-8 h-8 text-brand-gray-600 mx-auto mb-3" />
                                                <p className="text-brand-gray-500 font-bold text-sm tracking-tight uppercase">ไม่มีคำขอที่ค้างอยู่</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'maintenance_tab' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div>
                                        <h3 className="text-xl font-bold text-white uppercase tracking-tight">รายการแจ้งซ่อม</h3>
                                        <p className="text-brand-gray-400 text-xs font-medium mt-1">จัดการลำดับความสำคัญและติดตามสถานะการซ่อม</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {maintenanceRequests.length === 0 ? (
                                            <div className="col-span-full text-center py-16 bg-white/5 rounded-xl border border-dashed border-white/10">
                                                <MessageSquare className="w-8 h-8 text-brand-gray-600 mx-auto mb-3" />
                                                <p className="text-brand-gray-500 font-bold text-sm tracking-tight uppercase">ไม่มีรายการแจ้งซ่อม</p>
                                            </div>
                                        ) : (
                                            maintenanceRequests.map((req) => (
                                                <div key={req.id} className="bg-brand-bg rounded-xl border border-white/10 p-4 hover:border-brand-orange-500/30 transition-all flex flex-col justify-between group">
                                                    <div>
                                                        <div className="flex justify-between items-start mb-3">
                                                            <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${req.priority === 'ฉุกเฉิน' ? 'bg-red-500/20 text-red-500' :
                                                                req.priority === 'ด่วน' ? 'bg-orange-500/20 text-orange-500' :
                                                                    'bg-blue-500/20 text-blue-500'
                                                                }`}>
                                                                {req.priority}
                                                            </div>
                                                            <p className="text-[10px] font-bold text-brand-gray-500">
                                                                #{req.roomNumber}
                                                            </p>
                                                        </div>
                                                        <h4 className="text-white font-bold text-sm mb-1">{req.title}</h4>
                                                        <p className="text-xs text-brand-gray-400 line-clamp-3 mb-4 leading-relaxed">{req.description}</p>
                                                    </div>

                                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-[10px] font-bold text-brand-gray-500">{req.tenantName}</p>
                                                            <p className="text-[10px] font-bold text-brand-gray-500">
                                                                {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString('th-TH') : ''}
                                                            </p>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-1">
                                                            {[
                                                                { id: 'pending', label: 'รอกลาง', color: 'yellow' },
                                                                { id: 'in-progress', label: 'กำลังซ่อม', color: 'blue' },
                                                                { id: 'completed', label: 'เสร็จสิ้น', color: 'emerald' }
                                                            ].map(st => (
                                                                <button
                                                                    key={st.id}
                                                                    onClick={() => handleUpdateMaintenanceStatus(req.id, st.id)}
                                                                    className={`px-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all border ${req.status === st.id
                                                                        ? `bg-${st.color === 'yellow' ? 'yellow-500 text-brand-bg border-yellow-500' : st.color === 'blue' ? 'blue-500 text-brand-bg border-blue-500' : 'emerald-500 text-brand-bg border-emerald-500'}`
                                                                        : 'bg-white/5 text-brand-gray-400 border-white/5 hover:border-white/10'
                                                                        }`}
                                                                >
                                                                    {st.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            {/* Tenant Approval Modal */}
            {isApproveModalOpen && requestToApprove && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsApproveModalOpen(false)}></div>
                    <div className="relative bg-brand-card w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-brand-orange-500/10 rounded-xl flex items-center justify-center shrink-0">
                                    <ClipboardList className="w-5 h-5 text-brand-orange-500" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white leading-tight">อนุมัติการเข้าพัก</h3>
                                    <p className="text-[10px] font-bold text-brand-gray-400 uppercase tracking-widest truncate max-w-[180px]">{requestToApprove.userName || requestToApprove.userEmail || requestToApprove.userPhone}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* ยอดรวมเล็กๆ ที่หัว */}
                                {approvalRoom && (
                                    <div className="text-right">
                                        <p className="text-[9px] font-bold text-brand-gray-500 uppercase tracking-widest">รวม/เดือน</p>
                                        <p className="text-sm font-black text-brand-orange-500">
                                            {(
                                                (approvalRoom.price || utilityRates.baseRent || 0) +
                                                approvalExpenses.filter(e => e.active).reduce((sum, e) => sum + e.amount, 0)
                                            ).toLocaleString()} บ.
                                        </p>
                                    </div>
                                )}
                                <button onClick={() => setIsApproveModalOpen(false)} className="text-brand-gray-300 hover:text-white transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-5 h-[60vh] overflow-y-auto custom-scrollbar">
                            {/* Room Selection */}
                            <div>
                                <label className="text-xs font-bold text-brand-gray-400 mb-2 block ml-1 uppercase">เลือกห้องพัก</label>
                                <select
                                    value={approvalRoom?.roomNumber || ''}
                                    onChange={(e) => {
                                        const r = rooms.find(rm => rm.roomNumber === e.target.value);
                                        setApprovalRoom(r || null);
                                        if (r) {
                                            // ค่าบริการเริ่มต้น active: false ทั้งหมด ให้ user กดเปิดเอง
                                            setApprovalExpenses(r.fixedExpenses
                                                ? r.fixedExpenses.map(fe => ({ ...fe, active: false }))
                                                : fixedExpenses.map(fe => ({ ...fe, active: false }))
                                            );
                                            setApprovalAmenities(r.amenities || amenities.map(am => ({ ...am, status: true })));
                                            setApprovalWaterMeter(r.waterMeter || 0);
                                            setApprovalElecMeter(r.electricityMeter || 0);
                                        }
                                    }}
                                    className="w-full bg-brand-bg border border-white/10 rounded-xl px-4 py-3 text-lg font-bold text-white outline-none focus:border-brand-orange-500/50 transition-all appearance-none text-center"
                                >
                                    <option value="">-- เลือกห้องพัก --</option>
                                    {rooms.filter(r => r.status === 'ว่าง' || r.roomNumber === requestToApprove.roomNumber).map(r => (
                                        <option key={r.roomNumber} value={r.roomNumber}>ห้อง {r.roomNumber}</option>
                                    ))}
                                </select>
                            </div>

                            {approvalRoom && (
                                <>
                                    {/* Summary Row */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-brand-bg/50 p-4 rounded-2xl border border-white/5">
                                            <p className="text-[10px] font-bold text-brand-gray-400 uppercase tracking-widest mb-1">ค่าเช่าหลัก</p>
                                            <p className="text-xl font-black text-white">{approvalRoom.price?.toLocaleString() || utilityRates.baseRent?.toLocaleString()} <span className="text-xs font-bold text-brand-gray-500">บ.</span></p>
                                        </div>
                                        <div className="bg-brand-bg/50 p-4 rounded-2xl border border-white/5">
                                            <p className="text-[10px] font-bold text-brand-gray-400 uppercase tracking-widest mb-1">ชั้นที่พัก</p>
                                            <p className="text-xl font-black text-white">{approvalRoom.floor} <span className="text-xs font-bold text-brand-gray-500">FL.</span></p>
                                        </div>
                                    </div>

                                    {/* Utilities Info */}
                                    <div className="flex items-center justify-between px-4 py-2 bg-brand-orange-500/5 border border-brand-orange-500/10 rounded-xl">
                                        <div className="flex items-center gap-2">
                                            <Zap className="w-3 h-3 text-yellow-500" />
                                            <span className="text-[10px] font-bold text-brand-gray-300 uppercase">ค่าไฟ {utilityRates.electricity} บ.</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Droplets className="w-3 h-3 text-blue-500" />
                                            <span className="text-[10px] font-bold text-brand-gray-300 uppercase">ค่าน้ำ {utilityRates.water} บ.</span>
                                        </div>
                                    </div>

                                    {/* Initial Meters */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-brand-gray-400 uppercase tracking-widest block ml-1 flex items-center gap-1">
                                                <Zap className="w-3 h-3 text-yellow-500" /> เลขมิเตอร์ไฟล่าสุด
                                            </label>
                                            <input
                                                type="number"
                                                value={approvalElecMeter}
                                                onChange={(e) => setApprovalElecMeter(e.target.value)}
                                                className="w-full bg-brand-bg rounded-xl px-4 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all text-center"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-brand-gray-400 uppercase tracking-widest block ml-1 flex items-center gap-1">
                                                <Droplets className="w-3 h-3 text-blue-500" /> เลขมิเตอร์น้ำล่าสุด
                                            </label>
                                            <input
                                                type="number"
                                                value={approvalWaterMeter}
                                                onChange={(e) => setApprovalWaterMeter(e.target.value)}
                                                className="w-full bg-brand-bg rounded-xl px-4 py-2.5 border border-white/10 outline-none font-bold text-white focus:border-brand-orange-500/50 transition-all text-center"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    {/* Fixed Expenses Selection */}
                                    {fixedExpenses.length > 0 && (
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-brand-gray-400 block ml-1 uppercase">ค่าบริการรายเดือนเพิ่มเติม</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {fixedExpenses.map((expense, idx) => {
                                                    const isSelected = approvalExpenses.find(fe => fe.name === expense.name)?.active;
                                                    return (
                                                        <button
                                                            key={idx}
                                                            onClick={() => {
                                                                const newExpenses = [...approvalExpenses];
                                                                const existingIdx = newExpenses.findIndex(fe => fe.name === expense.name);
                                                                if (existingIdx >= 0) {
                                                                    newExpenses[existingIdx].active = !newExpenses[existingIdx].active;
                                                                } else {
                                                                    newExpenses.push({ ...expense, active: true });
                                                                }
                                                                setApprovalExpenses(newExpenses);
                                                            }}
                                                            className={`
                                                                flex flex-col items-start px-4 py-3 rounded-2xl border transition-all
                                                                ${isSelected ? 'bg-brand-orange-500/10 border-brand-orange-500/30' : 'bg-transparent border-white/5'}
                                                            `}
                                                        >
                                                            <div className="flex items-center w-full justify-between mb-1">
                                                                <span className={`text-[11px] font-black uppercase tracking-tight ${isSelected ? 'text-brand-orange-500' : 'text-brand-gray-400'}`}>
                                                                    {expense.name}
                                                                </span>
                                                                <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${isSelected ? 'bg-brand-orange-500 border-brand-orange-500' : 'border-white/20'}`}>
                                                                    {isSelected && <Check className="w-2 h-2 text-brand-bg" strokeWidth={5} />}
                                                                </div>
                                                            </div>
                                                            <p className={`text-[10px] font-bold ${isSelected ? 'text-brand-orange-500/80' : 'text-brand-gray-500'}`}>
                                                                {expense.amount.toLocaleString()} บ.
                                                            </p>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Amenities Selection */}
                                    {approvalAmenities.length > 0 && (
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-brand-gray-400 block ml-1 uppercase">สิ่งอำนวยความสะดวกในห้อง</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {approvalAmenities.map((amenity, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            const newAms = [...approvalAmenities];
                                                            newAms[idx].status = !newAms[idx].status;
                                                            setApprovalAmenities(newAms);
                                                        }}
                                                        className={`
                                                            flex items-center px-4 py-3 rounded-2xl border transition-all text-[11px] font-bold
                                                            ${amenity.status ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/5 text-brand-gray-500'}
                                                        `}
                                                    >
                                                        <div className={`w-3.5 h-3.5 rounded-md mr-3 flex items-center justify-center border ${amenity.status ? 'bg-brand-orange-500 border-brand-orange-500' : 'border-white/10'}`}>
                                                            {amenity.status && <Check className="w-2.5 h-2.5 text-brand-bg" strokeWidth={4} />}
                                                        </div>
                                                        {amenity.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Total Estimation */}
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                        <div className="flex justify-between items-center mb-3">
                                            <p className="text-[10px] font-bold text-brand-gray-400 uppercase tracking-widest">ยอดรวมรายเดือนประมาณการ</p>
                                            <p className="text-[9px] text-brand-gray-500 italic">(ไม่รวมค่าน้ำ-ไฟตามจริง)</p>
                                        </div>
                                        {/* ค่าเช่าห้อง */}
                                        <div className="flex justify-between items-center py-1.5">
                                            <span className="text-xs text-brand-gray-400">ค่าเช่าห้อง</span>
                                            <span className="text-sm font-bold text-white">{(approvalRoom.price || utilityRates.baseRent || 0).toLocaleString()} บ.</span>
                                        </div>
                                        {/* ค่าบริการที่เปิดแล้ว */}
                                        {approvalExpenses.filter(e => e.active).map((e, i) => (
                                            <div key={i} className="flex justify-between items-center py-1">
                                                <span className="text-xs text-brand-gray-500">{e.name}</span>
                                                <span className="text-xs font-bold text-brand-orange-400">{e.amount.toLocaleString()} บ.</span>
                                            </div>
                                        ))}
                                        <div className="border-t border-white/10 mt-2 pt-2 flex justify-between items-center">
                                            <span className="text-xs font-bold text-brand-gray-400 uppercase">รวม</span>
                                            <div className="text-right">
                                                <p className="text-2xl font-black text-brand-orange-500">
                                                    {((approvalRoom.price || utilityRates.baseRent || 0) +
                                                        approvalExpenses
                                                            .filter(e => e.active)
                                                            .reduce((sum, e) => sum + e.amount, 0)
                                                    ).toLocaleString()}
                                                    <span className="text-xs font-bold ml-1.5 uppercase">บาท</span>
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="p-4 bg-brand-bg/50 border-t border-white/5 flex gap-3">
                            <button
                                onClick={() => {
                                    handleApproveRequest(requestToApprove);
                                    setIsApproveModalOpen(false);
                                }}
                                disabled={saving || !approvalRoom}
                                className="flex-1 bg-brand-orange-500 text-brand-bg py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-brand-orange-400 active:scale-95 transition-all shadow-lg shadow-brand-orange-500/20 disabled:opacity-50 disabled:active:scale-100"
                            >
                                {saving ? 'กำลังดำเนินการ...' : 'ยินยอมและอนุมัติเข้าพัก'}
                            </button>
                        </div>
                    </div>
                </div>
            )
            }
        </MainLayout >
    );
}
