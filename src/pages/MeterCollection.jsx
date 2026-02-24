import React, { useEffect, useState, useCallback } from 'react';
import {
    collection, query, where, getDocs, doc, setDoc,
    serverTimestamp, getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { getUserApartments } from '../utils/apartmentUtils';
import MainLayout from '../components/MainLayout';
import Toast, { useToast } from '../components/Toast';
import {
    Zap, Droplets, ChevronDown, ChevronRight,
    Save, Check, Loader2, Building, AlertCircle
} from 'lucide-react';

// ---------------------- helpers ----------------------
const generateRoomsFromConfig = (apt) => {
    const rooms = [];
    (apt.floors || []).forEach(floor => {
        for (let i = 1; i <= floor.roomCount; i++) {
            rooms.push({
                roomNumber: `${floor.id}${i.toString().padStart(2, '0')}`,
                floor: floor.id,
            });
        }
    });
    return rooms;
};

const fmtDate = (ts) => {
    if (!ts) return null;
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ---------------------- Component ----------------------
export default function MeterCollection({ user }) {
    const { toast, showToast, hideToast } = useToast();

    // --- State ---
    const [profile, setProfile] = useState(null);
    const [apartments, setApartments] = useState([]);
    const [activeAptId, setActiveAptId] = useState(localStorage.getItem('activeApartmentId'));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState({}); // { roomNumber: true/false }

    const [meterType, setMeterType] = useState('electricity'); // 'electricity' | 'water'
    const [floors, setFloors] = useState([]);
    const [roomData, setRoomData] = useState({}); // { roomNumber: { old, new, saved } }
    const [collapsedFloors, setCollapsedFloors] = useState(new Set());
    const [occupiedOnly, setOccupiedOnly] = useState(true);

    // --- Load ---
    const loadData = useCallback(async () => {
        if (!user || !activeAptId || activeAptId === 'all') {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            // profile
            const profSnap = await getDoc(doc(db, 'users', user.uid));
            if (profSnap.exists()) setProfile(profSnap.data());

            // apartments
            const apps = await getUserApartments(db, user);
            setApartments(apps);

            const apt = apps.find(a => a.id === activeAptId);
            if (!apt) { setLoading(false); return; }

            setFloors(apt.floors || []);

            // firestore rooms
            const rSnap = await getDocs(query(collection(db, 'rooms'), where('apartmentId', '==', activeAptId)));
            const fsRooms = {};
            rSnap.docs.forEach(d => { fsRooms[d.data().roomNumber] = { id: d.id, ...d.data() }; });

            // meter history for this month
            const now = new Date();
            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const mSnap = await getDocs(query(
                collection(db, 'meterReadings'),
                where('apartmentId', '==', activeAptId),
                where('monthKey', '==', monthKey)
            ));
            const meterMap = {};
            mSnap.docs.forEach(d => {
                const data = d.data();
                if (!meterMap[data.roomNumber]) meterMap[data.roomNumber] = {};
                meterMap[data.roomNumber][data.type] = { id: d.id, ...data };
            });

            // build roomData
            const generated = generateRoomsFromConfig(apt);
            const rd = {};
            generated.forEach(gr => {
                const fs = fsRooms[gr.roomNumber];
                const mEntry = meterMap[gr.roomNumber]?.[meterType === 'electricity' ? 'electricity' : 'water'];
                rd[gr.roomNumber] = {
                    roomNumber: gr.roomNumber,
                    floor: gr.floor,
                    tenantName: fs?.tenantName || null,
                    tenantId: fs?.tenantId || null,
                    status: fs?.status || 'ว่าง',
                    oldElec: fs?.electricityMeter ?? 0,
                    oldWater: fs?.waterMeter ?? 0,
                    // saved reading for this month
                    savedEntry: mEntry || null,
                    // input fields
                    newElec: mEntry?.type === 'electricity' ? String(mEntry.newReading) : '',
                    newWater: mEntry?.type === 'water' ? String(mEntry.newReading) : '',
                    // track per type whether saved this session
                    savedElec: !!meterMap[gr.roomNumber]?.electricity,
                    savedWater: !!meterMap[gr.roomNumber]?.water,
                };
            });
            setRoomData(rd);
        } catch (e) {
            console.error(e);
            showToast('โหลดข้อมูลล้มเหลว', 'error');
        }
        setLoading(false);
    }, [user, activeAptId, meterType]);

    useEffect(() => { loadData(); }, [loadData]);

    // --- Save one room ---
    const handleSave = async (roomNumber) => {
        const room = roomData[roomNumber];
        const isElec = meterType === 'electricity';
        const oldVal = isElec ? (room.oldElec ?? 0) : (room.oldWater ?? 0);
        const newValStr = isElec ? room.newElec : room.newWater;
        const newVal = parseFloat(newValStr);

        if (isNaN(newVal) || newValStr === '') {
            showToast('กรุณากรอกเลขมิเตอร์ใหม่', 'error');
            return;
        }
        if (newVal < oldVal) {
            showToast('เลขมิเตอร์ใหม่ต้องมากกว่าหรือเท่ากับเลขเก่า', 'error');
            return;
        }

        setSaving(prev => ({ ...prev, [roomNumber]: true }));
        try {
            const now = new Date();
            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const docId = `${activeAptId}_${roomNumber}_${meterType}_${monthKey}`;
            const docRef = doc(db, 'meterReadings', docId);
            const units = newVal - oldVal;
            const apt = apartments.find(a => a.id === activeAptId);
            const rate = isElec
                ? (apt?.utilityRates?.electricity || 0)
                : (apt?.utilityRates?.water || 0);

            await setDoc(docRef, {
                apartmentId: activeAptId,
                roomNumber,
                type: meterType,
                monthKey,
                oldReading: oldVal,
                newReading: newVal,
                units,
                rate,
                amount: units * rate,
                tenantId: room.tenantId || null,
                tenantName: room.tenantName || null,
                recordedBy: user.uid,
                recordedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }, { merge: true });

            // Also update the room document's meter field
            const rSnap = await getDocs(query(
                collection(db, 'rooms'),
                where('apartmentId', '==', activeAptId),
                where('roomNumber', '==', roomNumber)
            ));
            if (!rSnap.empty) {
                const roomDocRef = doc(db, 'rooms', rSnap.docs[0].id);
                await setDoc(roomDocRef, {
                    [isElec ? 'electricityMeter' : 'waterMeter']: newVal,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            setRoomData(prev => ({
                ...prev,
                [roomNumber]: {
                    ...prev[roomNumber],
                    [isElec ? 'savedElec' : 'savedWater']: true,
                    [isElec ? 'oldElec' : 'oldWater']: newVal,
                }
            }));
            showToast(`บันทึกมิเตอร์ห้อง ${roomNumber} เรียบร้อย`, 'success');
        } catch (e) {
            console.error(e);
            showToast('บันทึกล้มเหลว', 'error');
        }
        setSaving(prev => ({ ...prev, [roomNumber]: false }));
    };

    const handleAptSwitch = (id) => {
        localStorage.setItem('activeApartmentId', id);
        setActiveAptId(id);
    };

    const toggleFloor = (id) => {
        setCollapsedFloors(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const isElec = meterType === 'electricity';

    // stat
    const roomList = Object.values(roomData);
    const occupiedRooms = roomList.filter(r => r.tenantId);
    const savedCount = occupiedRooms.filter(r => isElec ? r.savedElec : r.savedWater).length;

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <Loader2 className="w-10 h-10 text-brand-orange-500 animate-spin" />
            </div>
        );
    }

    return (
        <MainLayout
            profile={profile}
            apartments={apartments}
            activeAptId={activeAptId}
            onAptSwitch={handleAptSwitch}
            title="เก็บมิเตอร์"
        >
            <Toast {...toast} onClose={hideToast} />

            <div className="px-4 lg:px-5 py-5 max-w-2xl mx-auto w-full space-y-4">

                {/* Type Toggle */}
                <div className="grid grid-cols-2 gap-2 bg-brand-card/50 p-1.5 rounded-2xl border border-white/5">
                    {[
                        { id: 'electricity', icon: <Zap className="w-4 h-4" />, label: 'ไฟฟ้า', color: 'text-yellow-400' },
                        { id: 'water', icon: <Droplets className="w-4 h-4" />, label: 'น้ำประปา', color: 'text-blue-400' },
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setMeterType(t.id)}
                            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all ${meterType === t.id
                                ? 'bg-brand-card border border-white/10 text-white shadow-sm'
                                : 'text-brand-gray-500 hover:text-white'}`}
                        >
                            <span className={meterType === t.id ? t.color : ''}>{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Summary bar */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${isElec ? 'bg-yellow-500/5 border-yellow-500/15' : 'bg-blue-500/5 border-blue-500/15'}`}>
                    <div className="flex items-center gap-2">
                        <span className={isElec ? 'text-yellow-400' : 'text-blue-400'}>
                            {isElec ? <Zap className="w-4 h-4" /> : <Droplets className="w-4 h-4" />}
                        </span>
                        <span className="text-sm font-medium text-white">
                            {isElec ? 'มิเตอร์ไฟฟ้า' : 'มิเตอร์น้ำ'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-brand-gray-400">บันทึกแล้ว</span>
                        <span className={`text-sm font-bold ${savedCount === occupiedRooms.length && occupiedRooms.length > 0 ? 'text-emerald-400' : 'text-white'}`}>
                            {savedCount}/{occupiedRooms.length} ห้อง
                        </span>
                    </div>
                </div>

                {/* Filter toggle */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setOccupiedOnly(!occupiedOnly)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${occupiedOnly ? 'bg-brand-orange-500/10 border-brand-orange-500/30 text-brand-orange-400' : 'border-white/10 text-brand-gray-400 hover:text-white'}`}
                    >
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${occupiedOnly ? 'bg-brand-orange-500 border-brand-orange-500' : 'border-white/20'}`}>
                            {occupiedOnly && <Check className="w-2 h-2 text-white" strokeWidth={4} />}
                        </span>
                        แสดงเฉพาะห้องที่มีผู้เช่า
                    </button>
                </div>

                {/* No apartment selected */}
                {(!activeAptId || activeAptId === 'all') && (
                    <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
                        <Building className="w-10 h-10 text-brand-gray-600 mx-auto mb-4" />
                        <p className="text-brand-gray-500 font-medium text-sm">กรุณาเลือกตึกก่อน</p>
                    </div>
                )}

                {/* Floors */}
                {floors.map(floor => {
                    const floorRooms = roomList
                        .filter(r => r.floor === floor.id)
                        .filter(r => !occupiedOnly || r.tenantId);

                    if (floorRooms.length === 0) return null;

                    const isCollapsed = collapsedFloors.has(floor.id);
                    const savedInFloor = floorRooms.filter(r => isElec ? r.savedElec : r.savedWater).length;
                    const allSaved = savedInFloor === floorRooms.length && floorRooms.length > 0;

                    return (
                        <div key={floor.id} className="bg-brand-card/40 border border-white/8 rounded-2xl overflow-hidden">
                            {/* Floor header */}
                            <button
                                onClick={() => toggleFloor(floor.id)}
                                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm transition-all ${allSaved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-brand-orange-500/10 text-brand-orange-500'}`}>
                                        {allSaved ? <Check className="w-4 h-4" /> : floor.id}
                                    </div>
                                    <div className="text-left">
                                        <p className="text-white font-semibold text-sm">ชั้น {floor.id}</p>
                                        <p className="text-xs text-brand-gray-500">{savedInFloor}/{floorRooms.length} บันทึกแล้ว</p>
                                    </div>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-brand-gray-500 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                            </button>

                            {/* Room rows */}
                            {!isCollapsed && (
                                <div className="divide-y divide-white/5 border-t border-white/5">
                                    {floorRooms.map(room => {
                                        const isSaved = isElec ? room.savedElec : room.savedWater;
                                        const oldVal = isElec ? room.oldElec : room.oldWater;
                                        const newValInput = isElec ? room.newElec : room.newWater;
                                        const newVal = parseFloat(newValInput);
                                        const units = !isNaN(newVal) && newValInput !== '' ? Math.max(0, newVal - oldVal) : null;
                                        const isSavingThis = saving[room.roomNumber];

                                        return (
                                            <div key={room.roomNumber} className={`px-4 py-4 transition-all ${isSaved ? 'bg-emerald-500/3' : ''}`}>
                                                {/* Room header row */}
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${isSaved ? 'bg-emerald-500/15 text-emerald-400' : room.tenantId ? 'bg-brand-orange-500/15 text-brand-orange-400' : 'bg-white/5 text-brand-gray-600'}`}>
                                                            {isSaved ? <Check className="w-4 h-4" /> : room.roomNumber}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-white leading-tight">ห้อง {room.roomNumber}</p>
                                                            <p className="text-xs text-brand-gray-500 leading-tight">{room.tenantName || 'ห้องว่าง'}</p>
                                                        </div>
                                                    </div>
                                                    {isSaved && (
                                                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                                            บันทึกแล้ว
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Meter inputs */}
                                                <div className="grid grid-cols-2 gap-2 mb-3">
                                                    {/* Old reading */}
                                                    <div className="bg-brand-bg/60 rounded-xl px-3 py-2.5 border border-white/5">
                                                        <p className="text-[10px] font-medium text-brand-gray-500 mb-1 flex items-center gap-1">
                                                            {isElec ? <Zap className="w-2.5 h-2.5 text-yellow-500" /> : <Droplets className="w-2.5 h-2.5 text-blue-400" />}
                                                            มิเตอร์เก่า
                                                        </p>
                                                        <p className="text-base font-bold text-brand-gray-300">{oldVal?.toLocaleString() || 0}</p>
                                                    </div>
                                                    {/* New reading */}
                                                    <div className={`rounded-xl px-3 py-2.5 border transition-all ${isSaved ? 'bg-emerald-500/5 border-emerald-500/20' :
                                                            (newValInput !== '' && newVal < oldVal) ? 'bg-red-500/5 border-red-500/50 focus-within:border-red-500' :
                                                                'bg-brand-bg border-white/10 focus-within:border-brand-orange-500/50'
                                                        }`}>
                                                        <p className={`text-[10px] font-medium mb-1 ${newValInput !== '' && newVal < oldVal ? 'text-red-400' : 'text-brand-gray-500'}`}>
                                                            มิเตอร์ใหม่ {newValInput !== '' && newVal < oldVal && '(ต้องไม่น้อยกว่าค่าเก่า)'}
                                                        </p>
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            value={newValInput}
                                                            onChange={e => setRoomData(prev => ({
                                                                ...prev,
                                                                [room.roomNumber]: {
                                                                    ...prev[room.roomNumber],
                                                                    [isElec ? 'newElec' : 'newWater']: e.target.value,
                                                                    [isElec ? 'savedElec' : 'savedWater']: false,
                                                                }
                                                            }))}
                                                            placeholder={String(oldVal || 0)}
                                                            className="w-full bg-transparent outline-none text-base font-bold text-white placeholder:text-white/20"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Units & Save */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5">
                                                        {units !== null && (
                                                            <span className={`text-xs font-medium px-2 py-1 rounded-lg ${units >= 0 ? 'bg-white/5 text-brand-gray-300' : 'bg-red-500/10 text-red-400'}`}>
                                                                {units >= 0 ? `+${units.toLocaleString()}` : units.toLocaleString()} หน่วย
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleSave(room.roomNumber)}
                                                        disabled={isSavingThis || newValInput === '' || newVal < oldVal}
                                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 ${isSaved
                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                            : (newValInput !== '' && newVal < oldVal) ? 'bg-brand-gray-800 text-brand-gray-500 cursor-not-allowed' : 'bg-brand-orange-500 text-brand-bg shadow-md shadow-brand-orange-500/20 hover:bg-brand-orange-400'}`}
                                                    >
                                                        {isSavingThis ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : isSaved ? (
                                                            <><Check className="w-3.5 h-3.5" /> แก้ไข</>
                                                        ) : (
                                                            <><Save className="w-3.5 h-3.5" /> บันทึก</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Empty state */}
                {floors.length > 0 && roomList.filter(r => !occupiedOnly || r.tenantId).length === 0 && (
                    <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
                        <AlertCircle className="w-8 h-8 text-brand-gray-600 mx-auto mb-3" />
                        <p className="text-brand-gray-500 font-medium text-sm">ไม่มีห้องที่มีผู้เช่าในขณะนี้</p>
                    </div>
                )}

            </div>
        </MainLayout>
    );
}
