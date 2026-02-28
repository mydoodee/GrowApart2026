import React, { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { signOut, updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage2 } from '../firebase';
import {
    LogOut, Home, MessageSquare, CreditCard, User, CheckCircle2,
    Activity, CircleUser, ChevronRight, ChevronLeft, X, Phone, Mail, Building, Bell,
    ArrowUpRight, Printer, History, Banknote, Receipt, Wallet, Zap, Droplets,
    FileText, Calendar, List, Download, Info, Snowflake, Fan,
    Bed, Shirt, Thermometer, Refrigerator, Tv, Wifi, LayoutGrid, Settings,
    Clock, AlertCircle
} from 'lucide-react';
import Toast, { useToast } from '../components/Toast';
import ProfileModal from '../components/ProfileModal';

export default function TenantDashboard({ user }) {
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [myRooms, setMyRooms] = useState([]);
    const [hasPendingRequest, setHasPendingRequest] = useState(false);
    const [historyGroups, setHistoryGroups] = useState([]);
    const [isHistoryMode, setIsHistoryMode] = useState(false);
    const [activeTab, setActiveTab] = useState('bills');
    const [apartmentDetails, setApartmentDetails] = useState({});
    const [maintenanceRequests, setMaintenanceRequests] = useState([]);
    const [maintenanceForm, setMaintenanceForm] = useState({
        title: '',
        priority: 'ปกติ',
        description: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [payments, setPayments] = useState([]);
    const [paymentsLoading, setPaymentsLoading] = useState(true);
    const [showFirstBillModal, setShowFirstBillModal] = useState(false);
    const firstBillPrintRef = useRef(null);
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
    const [selectedMonths, setSelectedMonths] = useState(new Set());
    const [billViewMode, setBillViewMode] = useState('calendar'); // 'calendar' or 'list'
    const [roomSubTab, setRoomSubTab] = useState('expenses'); // 'expenses' or 'contract'
    const [selectedPayment, setSelectedPayment] = useState(null);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [printData, setPrintData] = useState(null);
    const paymentPrintRef = useRef(null);

    // Profile Edit State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const AmenityIcons = {
        'เครื่องปรับอากาศ': <Snowflake size={18} />,
        'พัดลม': <Fan size={18} />,
        'เตียงนอน': <Bed size={18} />,
        'ตู้เสื้อผ้า': <Shirt size={18} />,
        'เครื่องทำน้ำอุ่น': <Thermometer size={18} />,
        'ตู้เย็น': <Refrigerator size={18} />,
        'โทรทัศน์': <Tv size={18} />,
        'โต๊ะเครื่องแป้ง': <User size={18} />,
        'WiFi': <Wifi size={18} />
    };

    const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'สวัสดียามเช้า';
        if (hour < 17) return 'สวัสดียามบ่าย';
        if (hour < 20) return 'สวัสดียามค่ำคืน';
        return 'สวัสดียามค่ำคืน';
    };

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        // Check history for Option B
        const checkHistory = async () => {
            try {
                const histQ = query(
                    collection(db, 'tenantHistory'),
                    where('tenantId', '==', user.uid)
                );
                const histSnap = await getDocs(histQ);
                if (!histSnap.empty) {
                    const history = histSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                        .sort((a, b) => b.movedOutAt?.seconds - a.movedOutAt?.seconds);
                    setHistoryGroups(history);
                    setIsHistoryMode(true);

                    // Fetch details for historical apartments
                    for (const h of history) {
                        if (h.apartmentId) {
                            const aptRef = doc(db, 'apartments', h.apartmentId);
                            const aptSnap = await getDoc(aptRef);
                            if (aptSnap.exists()) {
                                setApartmentDetails(prev => ({ ...prev, [h.apartmentId]: aptSnap.data() }));
                            }
                        }
                    }
                } else {
                    setIsHistoryMode(false);
                }
            } catch (err) {
                console.error("Error checking history", err);
            }
        };

        // 1. Listen for rooms where this user is the tenant
        const roomsQ = query(collection(db, 'rooms'), where('tenantId', '==', user.uid));
        const unsubscribeRooms = onSnapshot(roomsQ, async (snap) => {
            const roomsData = [];
            const aptIds = new Set();

            snap.forEach(d => {
                const data = { id: d.id, ...d.data() };
                roomsData.push(data);
                if (data.apartmentId) aptIds.add(data.apartmentId);
            });

            setMyRooms(roomsData);

            if (roomsData.length > 0) {
                // Active tenant
                setIsHistoryMode(false);
                // Fetch apartment details if they exist in a reactive way
                for (const id of aptIds) {
                    const aptRef = doc(db, 'apartments', id);
                    const aptSnap = await getDoc(aptRef);
                    if (aptSnap.exists()) {
                        setApartmentDetails(prev => ({
                            ...prev,
                            [id]: aptSnap.data()
                        }));
                    }
                }
                setHasPendingRequest(false); // If has rooms, no need to show pending
            } else {
                // Not an active tenant, check for history or pending request
                setActiveTab('dashboard');
                setupRequestSubscriber();
                checkHistory();
            }
            setLoading(false);
        }, (error) => {
            console.error("Error listening to rooms", error);
            setLoading(false);
        });

        // 2. Listen for pending requests if no rooms are found
        let unsubscribeRequests = null;
        const setupRequestSubscriber = () => {
            if (unsubscribeRequests) return;

            const reqQ = query(
                collection(db, 'requests'),
                where('userId', '==', user.uid),
                where('status', '==', 'pending')
            );

            unsubscribeRequests = onSnapshot(reqQ, (snap) => {
                console.log("[TenantDashboard] Pending requests listener fired. Found:", !snap.empty);
                setHasPendingRequest(!snap.empty);
            }, (error) => {
                console.warn("[TenantDashboard] Error listening to requests", error);
            });
        };
        setupRequestSubscriber();

        // 3. Listen for maintenance requests
        let unsubscribeMaintenance = null;
        if (user?.uid) {
            const maintQSimple = query(
                collection(db, 'maintenance'),
                where('tenantId', '==', user.uid)
            );

            unsubscribeMaintenance = onSnapshot(maintQSimple, (snap) => {
                const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
                setMaintenanceRequests(requests);
            }, (error) => {
                if (error.code !== 'permission-denied') {
                    console.error("Error listening to maintenance", error);
                }
            });
        }

        // 4. Listen for payments
        let unsubscribePayments = null;
        if (user?.uid) {
            const payQ = query(
                collection(db, 'payments'),
                where('tenantId', '==', user.uid)
            );
            unsubscribePayments = onSnapshot(payQ, (snap) => {
                const paymentsList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
                setPayments(paymentsList);
                setPaymentsLoading(false);
            }, (error) => {
                console.error('Error listening to payments', error);
                setPaymentsLoading(false);
            });
        }

        return () => {
            if (unsubscribeRooms) unsubscribeRooms();
            if (unsubscribeRequests) unsubscribeRequests();
            if (unsubscribeMaintenance) unsubscribeMaintenance();
            if (unsubscribePayments) unsubscribePayments();
        };
    }, [user]);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/tenant-login', { replace: true });
    };

    const handleSubmitMaintenance = async () => {
        if (!maintenanceForm.title.trim()) {
            showToast('กรุณาระบุหัวข้อเรื่อง', 'error');
            return;
        }
        if (myRooms.length === 0) {
            showToast('ไม่พบข้อมูลห้องพัก', 'error');
            return;
        }
        setSubmitting(true);
        try {
            const room = myRooms[0];
            await addDoc(collection(db, 'maintenance'), {
                ...maintenanceForm,
                tenantId: user.uid,
                tenantName: user.displayName || user.email,
                roomNumber: room.roomNumber,
                apartmentId: room.apartmentId,
                status: 'pending',
                createdAt: serverTimestamp()
            });
            setMaintenanceForm({ title: '', priority: 'ปกติ', description: '' });
            showToast('แจ้งซ่อมเรียบร้อย', 'success');
        } catch (e) {
            console.error(e);
            showToast('เกิดข้อผิดพลาด', 'error');
        }
        setSubmitting(false);
    };

    // ── First bill helpers ──────────────────────────────────
    const getFirstBillItems = (room, apt) => {
        if (!room) return [];
        const items = [];
        const rentPrice = room.price || room.rentAmount || apt?.utilityRates?.baseRent || 0;
        items.push({ label: 'ค่าเช่าห้อง (เดือนแรก)', amount: rentPrice });
        if (room.deposit) items.push({ label: 'ค่ามัดจำ', amount: room.deposit });
        if (room.fixedExpenses) {
            room.fixedExpenses.filter(e => e.active).forEach(e => {
                items.push({ label: e.name, amount: e.amount || 0 });
            });
        }
        return items;
    };

    const handlePrintFirstBill = () => {
        const el = firstBillPrintRef.current;
        if (!el) return;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>ใบแจ้งค่าแรกเข้า</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; padding: 24px; color: #222; }
                    .bill-container { max-width: 420px; margin: 0 auto; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 16px; }
                    .header h1 { font-size: 20px; font-weight: 900; margin-bottom: 4px; }
                    .header p { font-size: 12px; color: #555; }
                    .info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed #ddd; }
                    .info-row .label { color: #666; }
                    .info-row .value { font-weight: 700; }
                    .item-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
                    .total-row { display: flex; justify-content: space-between; padding: 12px 0 8px; font-size: 18px; font-weight: 900; border-top: 2px solid #333; margin-top: 8px; }
                    .qr-section { text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px dashed #ddd; }
                    .qr-section p { font-size: 11px; color: #666; margin-bottom: 8px; }
                    .qr-section svg { width: 160px; height: 160px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #aaa; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>${el.innerHTML}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.onload = () => { printWindow.print(); };
    };

    const handlePrintPayments = (yearPayments, yearTotal, paidTotal, calendarYear, room, firstBillPaid) => {
        const printWindow = window.open('', '_blank');
        const thMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

        const rows = yearPayments.map(p => {
            const mIdx = parseInt(p.month.split('-')[1]) - 1;
            return `
                <tr>
                    <td>${thMonthsFull[mIdx]}</td>
                    <td>${p.status === 'paid' ? 'จ่ายแล้ว' : 'ค้างชำระ'}</td>
                    <td>${p.amount?.toLocaleString() || 0} บ.</td>
                </tr>
            `;
        }).join('');

        const firstBillFormatted = firstBillPaid ? `
            <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <p style="font-weight: bold; margin-bottom: 5px;">ชำระค่าแรกเข้าเรียบร้อยแล้ว</p>
                <div style="display: flex; justify-content: space-between;">
                    <span>รวมยอดทั้งปี ${calendarYear + 543} (รวมค่าแรกเข้า)</span>
                    <span style="font-weight: bold; font-size: 1.2em;">${yearTotal.toLocaleString()} บ.</span>
                </div>
            </div>
        ` : '';

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>รายงานการชำระเงิน - ห้อง ${room?.roomNumber}</title>
                <style>
                    body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #334155; }
                    header { margin-bottom: 30px; text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
                    h1 { margin: 0; color: #1e293b; font-size: 24px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 12px; border: 1px solid #e2e8f0; text-align: left; }
                    th { background: #f8fafc; font-weight: bold; }
                    .summary { margin-top: 30px; padding: 20px; background: #f1f5f9; border-radius: 12px; }
                    .summary-item { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 18px; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <header>
                    <h1>รายงานสรุปการชำระเงิน ปี ${calendarYear + 543}</h1>
                    <p>หอพัก ${primaryApt?.general?.name || ''} | ห้อง ${room?.roomNumber}</p>
                </header>
                ${firstBillFormatted}
                <table>
                    <thead>
                        <tr>
                            <th>เดือน</th>
                            <th>สถานะ</th>
                            <th>ยอดเงิน</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                <div class="summary">
                    <div class="summary-item">
                        <span>รวมยอดทั้งปี:</span>
                        <span style="font-weight: 800;">${yearTotal.toLocaleString()} บาท</span>
                    </div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.onload = () => { printWindow.print(); };
    };

    const handlePrintBill = (payment) => {
        setPrintData(payment);
        setShowPrintPreview(true);
    };

    const executePrint = () => {
        const payment = printData;
        const apt = apartmentDetails[payment.apartmentId];
        const printWindow = window.open('', '_blank');
        const mIdx = parseInt(payment.month.split('-')[1]) - 1;
        const thMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        const monthStr = `${thMonthsFull[mIdx]} ${parseInt(payment.month.split('-')[0]) + 543}`;

        const rows = [
            `<tr>
                <td class="item-label">ค่าเช่าห้อง</td>
                <td class="item-desc">-</td>
                <td class="item-amount">${(payment.details?.rent || 0).toLocaleString()} ฿</td>
            </tr>`
        ];

        if (payment.details?.electricity) {
            rows.push(`<tr>
                <td class="item-label">ค่าไฟฟ้า</td>
                <td class="item-desc">${payment.details.electricity.old} - ${payment.details.electricity.new} (${payment.details.electricity.units} หน่วย)</td>
                <td class="item-amount">${(payment.details.electricity.amount || 0).toLocaleString()} ฿</td>
            </tr>`);
        }
        if (payment.details?.water) {
            rows.push(`<tr>
                <td class="item-label">ค่าน้ำ</td>
                <td class="item-desc">${payment.details.water.old} - ${payment.details.water.new} (${payment.details.water.units} หน่วย)</td>
                <td class="item-amount">${(payment.details.water.amount || 0).toLocaleString()} ฿</td>
            </tr>`);
        }
        (payment.details?.fixedExpenses || []).forEach(ex => {
            rows.push(`<tr>
                <td class="item-label">${ex.name}</td>
                <td class="item-desc">-</td>
                <td class="item-amount">${(ex.amount || 0).toLocaleString()} ฿</td>
            </tr>`);
        });

        const qrCodeHtml = payment.status !== 'paid' && apt?.bankDetails?.promptpay
            ? `<div class="qr-section">
                <div class="qr-label">สแกนเพื่อชำระเงิน (PromptPay)</div>
                <div class="qr-container">
                    <img src="https://promptpay.io/${apt.bankDetails.promptpay}/${payment.amount}.png" />
                </div>
                <div class="qr-footer">
                    <strong>${apt?.bankDetails?.accountName || 'พร้อมเพย์'}</strong><br/>
                    <span>${apt.bankDetails.promptpay}</span>
                </div>
               </div>`
            : '';

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>GrowApart Invoice - ห้อง \${payment.roomNumber}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&family=Inter:wght@400;600;800&display=swap');
                    
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    
                    body { 
                        font-family: 'Sarabun', 'Inter', sans-serif; 
                        background: #fff; 
                        padding: 20px; 
                        color: #1e293b; 
                        line-height: 1.4;
                        display: flex;
                        justify-content: center;
                    }
                    
                    .receipt {
                        width: 100%;
                        max-width: 400px;
                        border-radius: 0;
                        padding: 10px;
                    }
                    
                    header {
                        padding: 20px 0;
                        text-align: center;
                        border-bottom: 2px dashed #e2e8f0;
                        margin-bottom: 20px;
                    }
                    
                    .apt-name {
                        font-size: 24px;
                        font-weight: 800;
                        color: #000;
                        margin-bottom: 4px;
                    }
                    
                    .title {
                        font-size: 14px;
                        font-weight: 700;
                        text-transform: uppercase;
                        color: #64748b;
                        letter-spacing: 1px;
                    }
                    
                    .info-section {
                        padding-bottom: 20px;
                        border-bottom: 1px dashed #e2e8f0;
                        margin-bottom: 20px;
                    }
                    
                    .info-row {
                        margin-bottom: 12px;
                    }
                    
                    .info-label {
                        display: block;
                        font-size: 11px;
                        font-weight: 800;
                        color: #94a3b8;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin-bottom: 2px;
                    }
                    
                    .info-value {
                        font-size: 16px;
                        font-weight: 700;
                        color: #1e293b;
                    }
                    
                    .status-value {
                        padding: 2px 8px;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 800;
                    }
                    .status-paid { color: #166534; }
                    .status-pending { color: #ea580c; }
                    
                    .items-section {
                        margin-bottom: 20px;
                    }
                    
                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    
                    th {
                        text-align: left;
                        font-size: 11px;
                        font-weight: 800;
                        color: #94a3b8;
                        text-transform: uppercase;
                        padding-bottom: 10px;
                        border-bottom: 1px solid #f1f5f9;
                    }
                    
                    td {
                        padding: 10px 0;
                        vertical-align: top;
                    }
                    
                    .item-label { font-size: 14px; font-weight: 700; color: #334155; }
                    .item-desc { font-size: 11px; color: #94a3b8; font-weight: 500; display: block; }
                    .item-amount { text-align: right; font-size: 14px; font-weight: 700; color: #1e293b; }
                    
                    .total-section {
                        margin-top: 10px;
                        padding: 20px;
                        background: #f8fafc;
                        border-radius: 12px;
                        text-align: center;
                        border: 1px solid #f1f5f9;
                    }
                    
                    .total-label { 
                        font-size: 20px; 
                        font-weight: 900; 
                        color: #1e293b; 
                        display: block;
                        line-height: 1;
                        margin-bottom: 4px;
                    }
                    .total-value { 
                        font-size: 44px; 
                        font-weight: 900; 
                        color: #000; 
                        font-family: 'Inter', sans-serif; 
                        letter-spacing: -2px;
                        line-height: 1;
                    }
                    .total-unit { 
                        font-size: 18px; 
                        font-weight: 800; 
                        color: #64748b;
                        margin-left: 5px;
                    }
                    
                    .qr-section {
                        margin: 20px 0;
                        padding: 20px;
                        border-radius: 20px;
                        text-align: center;
                        border: 2px dashed #f1f5f9;
                    }
                    
                    .qr-label { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 15px; }
                    .qr-container { padding: 10px; display: inline-block; }
                    .qr-container img { width: 140px; height: 140px; display: block; }
                    .qr-footer { margin-top: 10px; font-size: 14px; font-weight: 700; color: #1e293b; }
                    
                    footer {
                        padding: 20px 0;
                        text-align: center;
                        border-top: 1px dashed #e2e8f0;
                        margin-top: 20px;
                    }
                    
                    .thankyou { font-size: 14px; font-weight: 800; color: #475569; margin-bottom: 4px; }
                    .timestamp { font-size: 11px; font-weight: 500; color: #94a3b8; }
                    
                    @media print {
                        body { background: white; padding: 0; }
                        .receipt { box-shadow: none; border: none; max-width: 100%; }
                    }
                </style>
            </head>
            <body>
                <div class="receipt">
                    <header>
                        <div class="apt-name">\${apt?.general?.name || ''}</div>
                        <div class="title">ใบแจ้งหนี้ประจำเดือน</div>
                    </header>
                    
                    <div class="info-section">
                        <div class="info-row">
                            <span class="info-label">ห้อง</span>
                            <span class="info-value">\${payment.roomNumber}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">รอบบิล</span>
                            <span class="info-value">\${monthStr}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">สถานะ</span>
                            <span class="info-value status-\${payment.status}">
                                \${payment.status === 'paid' ? 'ชำระแล้ว' : 'รอการชำระ'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="items-section">
                        <table>
                            <thead>
                                <tr>
                                    <th>รายการ / รายละเอียด</th>
                                    <th style="text-align:right;">จำนวนเงิน</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${rows.join('')}
                            </tbody>
                        </table>
                    </div>

                    <div class="total-section">
                        <span class="total-label">รวมทั้งสิ้น</span>
                        <span class="total-value">\${payment.amount.toLocaleString()}</span>
                        <span class="total-unit">บาท</span>
                    </div>
                    
                    \${qrCodeHtml}
                    
                    <footer>
                        <p class="thankyou">ขอบคุณที่ใช้บริการ</p>
                        <p class="timestamp">ออกโดยระบบ GrowApart เมื่อ \${new Date().toLocaleString('th-TH')}</p>
                    </footer>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.onload = () => { printWindow.print(); };
            if (printWindow.document.readyState === 'complete') {
                printWindow.print();
            }
        }, 500);
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <div className="w-12 h-12 border-4 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const NavItems = [
        { id: 'bills', icon: <Wallet className="w-5 h-5" />, label: 'บิลค่าเช่า' },
        { id: 'dashboard', icon: <Building className="w-5 h-5" />, label: 'ห้องเช่า' },
        { id: 'history', icon: <History className="w-5 h-5" />, label: 'ประวัติ' },
        { id: 'maintenance', icon: <Activity className="w-5 h-5" />, label: 'แจ้งซ่อม' },
        { id: 'profile', icon: <CircleUser className="w-5 h-5" />, label: 'โปรไฟล์' },
    ];

    const primaryApt = myRooms.length > 0 ? apartmentDetails[myRooms[0].apartmentId] : null;

    return (
        <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col relative pb-24 lg:pb-0 overflow-x-hidden">
            <Toast {...toast} onClose={hideToast} />
            <ProfileModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                user={user}
                showToast={showToast}
            />

            {/* Background Glows */}
            <div className="fixed top-[-10%] right-[-10%] w-[80%] h-[50%] bg-brand-orange-500/10 rounded-full blur-[120px] pointer-events-none z-0"></div>
            <div className="fixed bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none z-0"></div>

            {/* Sticky Mobile Header */}
            <header className="sticky top-0 z-[60] bg-brand-bg/60 backdrop-blur-xl border-b border-white/5 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-bg rounded-xl border border-white/10 flex items-center justify-center text-brand-orange-500 shadow-md overflow-hidden">
                        {primaryApt?.general?.logoURL ? (
                            <img src={primaryApt.general.logoURL} alt={primaryApt.general.name} className="w-full h-full object-cover" />
                        ) : (
                            <Building className="w-5 h-5" />
                        )}
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white tracking-tight leading-none">
                            {primaryApt?.general?.name || 'GrowApart'}
                        </h2>
                        <p className="text-[10px] font-medium text-brand-gray-500 tracking-wider uppercase mt-0.5">
                            {primaryApt?.general?.name ? 'ผู้เช่า' : 'Management'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button className="relative w-10 h-10 flex items-center justify-center bg-brand-card rounded-xl border border-white/10 text-brand-gray-400">
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-brand-bg"></span>
                    </button>
                    {activeTab === 'profile' && (
                        <button onClick={handleLogout} className="w-10 h-10 flex items-center justify-center bg-red-500/10 rounded-xl border border-red-500/10 text-red-500">
                            <LogOut className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 w-full max-w-lg mx-auto px-5 pt-6 relative z-10 transition-all">
                {activeTab === 'dashboard' && (
                    <div className="space-y-4 pb-10 animate-in fade-in slide-in-from-bottom-5 duration-700">

                        {myRooms.length === 0 ? (
                            <div className="space-y-4">
                                <div className="bg-brand-card/50 p-8 rounded-2xl text-center border border-white/5 backdrop-blur-sm relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-orange-500/5 rounded-bl-[4rem] group-hover:scale-110 transition-transform duration-700"></div>
                                    <div className="w-16 h-16 bg-brand-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-brand-orange-500">
                                        {hasPendingRequest ? <Clock className="w-8 h-8 animate-pulse" /> : <AlertCircle className="w-8 h-8" />}
                                    </div>
                                    <h2 className="text-white font-semibold text-xl mb-2">
                                        {hasPendingRequest ? 'กำลังรอดำเนินการ' : 'ไม่พบข้อมูลห้องพัก'}
                                    </h2>
                                    <p className="text-brand-gray-500 text-sm font-normal leading-relaxed max-w-[240px] mx-auto">
                                        {hasPendingRequest
                                            ? 'คำขอร่วมหอพักของคุณส่งไปแล้ว กรุณารอเจ้าของหอพักตรวจสอบข้อมูลครับ'
                                            : 'อีเมลของคุณยังไม่ได้ถูกผูกเข้ากับห้องพักใดๆ ในปัจจุบันครับ'}
                                    </p>
                                </div>

                                {isHistoryMode && historyGroups.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 px-1">
                                            <History className="w-4 h-4 text-brand-orange-500" />
                                            <h3 className="text-sm font-bold text-white uppercase tracking-wide">ประวัติการเช่า (ย้ายออกแล้ว)</h3>
                                        </div>
                                        {historyGroups.map((hist, idx) => (
                                            <div key={hist.id} className="bg-brand-card/30 border border-white/8 rounded-2xl p-4 flex items-center justify-between hover:border-brand-orange-500/30 transition-all group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-brand-gray-400">
                                                        <Building className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">หอพัก {hist.apartmentName}</p>
                                                        <p className="text-[10px] text-brand-gray-500">ห้อง {hist.roomNumber} • ชั้น {hist.floor}</p>
                                                        <p className="text-[9px] text-brand-orange-500/60 mt-0.5">
                                                            ย้ายออกเมื่อ {hist.movedOutAt?.toDate ? hist.movedOutAt.toDate().toLocaleDateString('th-TH') : '-'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setActiveTab('bills')}
                                                    className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-brand-gray-400 group-hover:bg-brand-orange-500 group-hover:text-brand-bg transition-all"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Premium Total Bill Card */}
                                {myRooms.map(room => {
                                    const apt = apartmentDetails[room.apartmentId];
                                    const rentPrice = room.price || room.rentAmount || apt?.utilityRates?.baseRent || 0;
                                    const totalEstimated = rentPrice + (room.fixedExpenses?.filter(e => e.active).reduce((sum, e) => sum + e.amount, 0) || 0);

                                    return (
                                        <div key={room.id} className="space-y-4">
                                            {/* Summary Card */}
                                            <div className="bg-gradient-to-br from-brand-orange-500 to-orange-600 rounded-2xl p-6 shadow-2xl shadow-brand-orange-500/30 relative overflow-hidden group active:scale-[0.98] transition-all">
                                                <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
                                                <div className="absolute bottom-[-20%] left-[-10%] w-48 h-48 bg-black/10 rounded-full blur-3xl"></div>

                                                <div className="flex items-center justify-between mb-6 relative z-10">
                                                    <div className="flex flex-col">
                                                        <p className="text-[10px] font-medium text-brand-bg/60 uppercase tracking-wider leading-none mb-1">{apt?.general?.name || 'Apartment'}</p>
                                                        <h4 className="text-xl font-bold text-brand-bg uppercase tracking-tight leading-none">ห้อง {room.roomNumber}</h4>
                                                    </div>
                                                    <div className="bg-brand-bg/20 backdrop-blur-md w-10 h-10 rounded-xl flex items-center justify-center border border-white/10">
                                                        <Wallet className="w-5 h-5 text-brand-bg" />
                                                    </div>
                                                </div>

                                                <div className="relative z-10 mb-6">
                                                    <p className="text-[10px] font-medium text-brand-bg/50 uppercase tracking-wider mb-1">ยอดประมาณการเดือนนี้</p>
                                                    <div className="flex items-baseline gap-2">
                                                        <h2 className="text-4xl font-black text-brand-bg tracking-tighter transition-all">
                                                            {totalEstimated.toLocaleString()}
                                                        </h2>
                                                        <span className="text-sm font-medium text-brand-bg/60 uppercase tracking-wider">THB</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-6 border-t border-white/10 relative z-10">
                                                    <div className="flex -space-x-2">
                                                        <div className="w-8 h-8 rounded-full border-2 border-brand-orange-500 bg-brand-bg flex items-center justify-center overflow-hidden">
                                                            <Activity className="w-4 h-4 text-brand-orange-500" />
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full border-2 border-brand-orange-500 bg-brand-bg flex items-center justify-center overflow-hidden">
                                                            <MessageSquare className="w-4 h-4 text-brand-orange-500" />
                                                        </div>
                                                    </div>
                                                    <button onClick={() => setActiveTab('bills')} className="bg-brand-bg text-brand-orange-500 px-5 py-2.5 rounded-2xl text-[10px] font-semibold uppercase tracking-wider shadow-xl active:scale-90 transition-all">
                                                        ชำระเงิน
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Sub-tab Navigator */}
                                            <div className="flex items-center gap-1 bg-brand-card/30 p-1 rounded-2xl border border-white/5 mb-4">
                                                <button
                                                    onClick={() => setRoomSubTab('expenses')}
                                                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${roomSubTab === 'expenses' ? 'bg-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/10' : 'text-brand-gray-500 hover:text-white'}`}
                                                >
                                                    <Wallet className="w-4 h-4" /> ค่าใช้จ่าย
                                                </button>
                                                <button
                                                    onClick={() => setRoomSubTab('contract')}
                                                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${roomSubTab === 'contract' ? 'bg-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/10' : 'text-brand-gray-500 hover:text-white'} `}
                                                >
                                                    <FileText className="w-4 h-4" /> สัญญาเช่า
                                                </button>
                                            </div>

                                            {roomSubTab === 'expenses' ? (
                                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                                    {/* Detailed Info Cards */}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="bg-brand-card/50 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
                                                            <div className="w-10 h-10 bg-yellow-500/10 rounded-2xl flex items-center justify-center text-yellow-500 mb-3">
                                                                <Zap size={20} />
                                                            </div>
                                                            <p className="text-[10px] font-medium text-brand-gray-500 uppercase tracking-wider mb-1">ค่าไฟฟ้า</p>
                                                            <p className="text-lg font-bold text-white">{apt?.utilityRates?.electricity || 0} <span className="text-xs font-normal text-brand-gray-400">บ./หน่วย</span></p>
                                                        </div>
                                                        <div className="bg-brand-card/50 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
                                                            <div className="w-10 h-10 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mb-3">
                                                                <Droplets size={20} />
                                                            </div>
                                                            <p className="text-[10px] font-medium text-brand-gray-500 uppercase tracking-wider mb-1">ค่าน้ำ</p>
                                                            <p className="text-lg font-bold text-white">{apt?.utilityRates?.water || 0} <span className="text-xs font-normal text-brand-gray-400">บ./หน่วย</span></p>
                                                        </div>
                                                    </div>

                                                    {/* Room Amenities Section */}
                                                    {(room.amenities && room.amenities.some(a => a.status)) && (
                                                        <div className="space-y-3">
                                                            <h3 className="text-[10px] font-medium text-brand-gray-500 uppercase tracking-widest ml-2">สิ่งอำนวยความสะดวกในห้อง</h3>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {room.amenities.filter(a => a.status).map((amenity, idx) => (
                                                                    <div key={idx} className="bg-brand-card/20 p-4 rounded-2xl border border-white/5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 50} ms` }}>
                                                                        <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-brand-orange-400">
                                                                            {AmenityIcons[amenity.name] || <CheckCircle2 size={18} />}
                                                                        </div>
                                                                        <p className="text-sm font-medium text-white/90">{amenity.name}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Fixed Services */}
                                                    <div className="space-y-3">
                                                        <h3 className="text-[10px] font-medium text-brand-gray-500 uppercase tracking-widest ml-2">ค่าบริการคงที่</h3>
                                                        <div className="space-y-2">
                                                            <div className="bg-brand-card/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center text-brand-gray-400">
                                                                        <Building size={16} />
                                                                    </div>
                                                                    <p className="text-sm font-medium text-white">ค่าเช่าห้องพัก</p>
                                                                </div>
                                                                <p className="text-sm font-semibold text-white">{(room.price || room.rentAmount || apt?.utilityRates?.baseRent || 0).toLocaleString()} <span className="text-xs text-brand-gray-500">฿</span></p>
                                                            </div>
                                                            {room.fixedExpenses?.filter(e => e.active).map((expense, idx) => (
                                                                <div key={idx} className="bg-brand-card/30 p-4 rounded-2xl border border-white/5 flex items-center justify-between animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${idx * 100} ms` }}>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center text-brand-gray-400">
                                                                            <Activity size={16} />
                                                                        </div>
                                                                        <p className="text-sm font-medium text-white">{expense.name}</p>
                                                                    </div>
                                                                    <p className="text-sm font-semibold text-white">{expense.amount.toLocaleString()} <span className="text-xs text-brand-gray-500">฿</span></p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                                    {/* Contract Tab View */}
                                                    <div className="bg-brand-card/50 p-6 rounded-2xl border border-white/5 backdrop-blur-md text-center">
                                                        <div className="flex items-center justify-center gap-3 mb-6">
                                                            <div className="w-10 h-10 bg-brand-orange-500/10 rounded-xl flex items-center justify-center text-brand-orange-500">
                                                                <FileText className="w-5 h-5" />
                                                            </div>
                                                            <h3 className="text-white font-bold text-lg">สัญญาเช่า</h3>
                                                        </div>
                                                        <p className="text-brand-gray-500 text-sm mb-6 px-4">ดูข้อมูลสัญญาเช่าและวันครบกำหนดสัญญาของคุณได้ที่นี่</p>

                                                        <div className="space-y-3 text-left">
                                                            <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                                                                <span className="text-brand-gray-400 text-xs">วันเริ่มสัญญา</span>
                                                                <span className="text-white font-semibold text-sm">{room.leaseStart || '-'}</span>
                                                            </div>
                                                            <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                                                                <span className="text-brand-gray-400 text-xs">วันสิ้นสุดสัญญา</span>
                                                                <span className="text-white font-semibold text-sm">{room.leaseEnd || '-'}</span>
                                                            </div>
                                                            {apt?.contractInfo?.pdfURL ? (
                                                                <a
                                                                    href={apt.contractInfo.pdfURL}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="w-full py-3.5 bg-brand-orange-500 hover:bg-brand-orange-400 border border-brand-orange-500/20 rounded-xl text-xs font-bold text-brand-bg transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-orange-500/20"
                                                                >
                                                                    <Download className="w-4 h-4" /> ดูไฟล์สัญญา (PDF)
                                                                </a>
                                                            ) : (
                                                                <button
                                                                    className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-brand-gray-300 transition-all flex items-center justify-center gap-2"
                                                                    onClick={() => showToast('ยังไม่มีการอัปโหลดไฟล์สัญญาในระบบ', 'info')}
                                                                >
                                                                    <Download className="w-4 h-4" /> ดาวน์โหลดไฟล์สัญญา (PDF)
                                                                </button>
                                                            )}

                                                            {/* Template Section */}
                                                            {apt?.contractInfo?.template && (
                                                                <div className="mt-6 pt-6 border-t border-white/5">
                                                                    <h4 className="text-[10px] font-bold text-brand-orange-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                                        <Info className="w-3.5 h-3.5" /> รายละเอียดข้อตกลง
                                                                    </h4>
                                                                    <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                                                                        <div className="text-xs text-brand-gray-300 leading-relaxed whitespace-pre-wrap font-medium">
                                                                            {apt.contractInfo.template}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'bills' && (() => {
                    const room = myRooms[0];
                    const apt = room ? apartmentDetails[room.apartmentId] : null;
                    const firstBillPaid = room?.firstBillPaid;
                    const firstBillItems = room ? getFirstBillItems(room, apt) : [];
                    const firstBillTotal = firstBillItems.reduce((s, i) => s + i.amount, 0);
                    const bankDetails = apt?.bankDetails || {};
                    const paidPayments = payments.filter(p => p.status === 'paid');

                    return (
                        <div className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h1 className="text-2xl font-bold text-white leading-tight">บิลค่าเช่า</h1>
                                    <p className="text-brand-gray-500 font-medium text-xs uppercase tracking-wider mt-1">Billing & Payment history</p>
                                </div>
                                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                                    <Wallet size={24} />
                                </div>
                            </div>

                            {/* ── First Bill Card ── */}
                            {room && firstBillItems.length > 0 && !firstBillPaid && (
                                <div className="bg-gradient-to-br from-brand-orange-500/10 to-orange-600/5 rounded-2xl border border-brand-orange-500/20 overflow-hidden">
                                    <div className="px-5 pt-5 pb-4">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="w-9 h-9 bg-brand-orange-500/15 rounded-xl flex items-center justify-center">
                                                <Receipt className="w-4.5 h-4.5 text-brand-orange-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-bold text-white leading-tight">ใบแจ้งค่าแรกเข้า</h3>
                                                <p className="text-[10px] font-medium text-brand-orange-400/60 uppercase tracking-wider">First Move-in Bill</p>
                                            </div>
                                            <span className="ml-auto px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-[10px] font-semibold text-yellow-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> รอชำระ
                                            </span>
                                        </div>

                                        <div className="space-y-2 mb-4">
                                            {firstBillItems.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                                                    <span className="text-xs font-medium text-brand-gray-400">{item.label}</span>
                                                    <span className="text-sm font-bold text-white">{item.amount.toLocaleString()} บ.</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex items-center justify-between pt-3 border-t border-white/10">
                                            <span className="text-sm font-bold text-brand-gray-300">รวมทั้งสิ้น</span>
                                            <span className="text-2xl font-black text-brand-orange-500">{firstBillTotal.toLocaleString()} <span className="text-sm font-bold">บาท</span></span>
                                        </div>
                                    </div>

                                    {/* QR PromptPay */}
                                    {bankDetails.promptpay && (
                                        <div className="px-5 py-4 bg-white/3 border-t border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-white p-2.5 rounded-xl shadow-md shrink-0">
                                                    <QRCodeSVG value={bankDetails.promptpay} size={80} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider mb-1">สแกนจ่ายผ่าน PromptPay</p>
                                                    <p className="text-sm font-bold text-white truncate">{bankDetails.accountName || 'ชื่อบัญชี'}</p>
                                                    <p className="text-xs font-medium text-brand-gray-400">{bankDetails.promptpay}</p>
                                                    {bankDetails.name && (
                                                        <p className="text-[10px] text-brand-gray-500 mt-0.5">{bankDetails.name} : {bankDetails.accountNo}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="px-5 py-3 border-t border-white/5">
                                        <button
                                            onClick={() => setShowFirstBillModal(true)}
                                            className="w-full py-3 bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-brand-orange-500/20"
                                        >
                                            <Printer className="w-4 h-4" /> ดูและปริ้นบิล
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* First Bill Paid status */}
                            {room && firstBillPaid && (
                                <div className="bg-emerald-500/5 rounded-2xl border border-emerald-500/15 px-5 py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white">ค่าแรกเข้าชำระแล้ว</p>
                                            <p className="text-[10px] font-medium text-emerald-400/60 uppercase tracking-wider">First bill paid</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowFirstBillModal(true)}
                                        className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-semibold text-brand-gray-300 transition-all flex items-center gap-1.5"
                                    >
                                        <FileText className="w-3.5 h-3.5" /> ดูบิล
                                    </button>
                                </div>
                            )}

                            {/* No bills at all */}
                            {(!room || firstBillItems.length === 0) && payments.length === 0 && !paymentsLoading && (
                                <div className="bg-brand-card/50 p-10 rounded-2xl text-center border border-white/5 backdrop-blur-md relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-[4rem] group-hover:scale-110 transition-transform duration-700"></div>
                                    <div className="w-20 h-20 bg-emerald-500/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 text-emerald-500/30">
                                        <Activity className="w-10 h-10" />
                                    </div>
                                    <p className="text-white font-semibold text-xl mb-2">ยังไม่มีใบแจ้งหนี้</p>
                                    <p className="text-brand-gray-500 text-sm font-normal leading-relaxed max-w-[240px] mx-auto">ยอดหนี้ของคุณจะปรากฏที่นี่ เมื่อเจ้าของหอพักสรุปยอดบิลประจำเดือนให้ครับ</p>
                                </div>
                            )}

                            {/* ── Payment Calendar ── */}
                            {(() => {
                                const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                                const thMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
                                const now = new Date();
                                const currentMonthKey = `${now.getFullYear()} -${String(now.getMonth() + 1).padStart(2, '0')} `;

                                // Build map: monthKey -> payment
                                const paymentMap = {};
                                payments.forEach(p => {
                                    if (p.month && p.type !== 'first_bill') {
                                        paymentMap[p.month] = p;
                                    }
                                });

                                // First bill entry for display
                                const firstBillPayment = payments.find(p => p.type === 'first_bill');

                                const yearNow = now.getFullYear();

                                // Calc yearly totals
                                const yearPayments = payments.filter(p => {
                                    if (p.type === 'first_bill') return false;
                                    if (!p.month) return false;
                                    return p.month.startsWith(`${calendarYear} -`);
                                });

                                // Include first bill if paid in this calendar year
                                const firstBillInYear = firstBillPayment?.paidAt?.toDate
                                    ? firstBillPayment.paidAt.toDate().getFullYear() === calendarYear
                                    : firstBillPayment?.status === 'paid' && calendarYear === now.getFullYear();
                                const firstBillAmount = (firstBillInYear && firstBillPayment?.amount) || 0;

                                const yearTotal = yearPayments.reduce((s, p) => s + (p.amount || 0), 0) + firstBillAmount;
                                const yearPaidTotal = yearPayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0) + firstBillAmount;

                                // Selected months summary
                                const toggleMonth = (monthKey) => {
                                    setSelectedMonths(prev => {
                                        const next = new Set(prev);
                                        next.has(monthKey) ? next.delete(monthKey) : next.add(monthKey);
                                        return next;
                                    });
                                };

                                const selectedTotal = [...selectedMonths].reduce((sum, mk) => {
                                    const p = paymentMap[mk];
                                    return sum + (p?.amount || 0);
                                }, 0);

                                const selectedPaidCount = [...selectedMonths].filter(mk => paymentMap[mk]?.status === 'paid').length;

                                return (
                                    <div className="space-y-4">
                                        {/* Year navigation & View Toggle */}
                                        <div className="flex flex-col gap-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-brand-orange-500" />
                                                    <h3 className="text-[10px] font-medium text-brand-gray-500 uppercase tracking-widest">ประวัติการชำระ</h3>
                                                </div>
                                                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
                                                    <button
                                                        onClick={() => setBillViewMode('calendar')}
                                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 ${billViewMode === 'calendar' ? 'bg-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/10' : 'text-brand-gray-500 hover:text-white'} `}
                                                    >
                                                        <LayoutGrid className="w-3 h-3" /> ปฏิทิน
                                                    </button>
                                                    <button
                                                        onClick={() => setBillViewMode('list')}
                                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 ${billViewMode === 'list' ? 'bg-brand-orange-500 text-brand-bg shadow-lg shadow-brand-orange-500/10' : 'text-brand-gray-500 hover:text-white'} `}
                                                    >
                                                        <List className="w-3 h-3" /> รายการ
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => { setCalendarYear(y => y - 1); setSelectedMonths(new Set()); }}
                                                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-brand-gray-400 hover:text-white transition-colors"
                                                    >
                                                        <ChevronLeft className="w-4 h-4" />
                                                    </button>
                                                    <span className="text-sm font-bold text-white min-w-[60px] text-center">{calendarYear + 543}</span>
                                                    <button
                                                        onClick={() => { setCalendarYear(y => y + 1); setSelectedMonths(new Set()); }}
                                                        disabled={calendarYear >= yearNow}
                                                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-brand-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                                    >
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handlePrintPayments(yearPayments, yearTotal, yearPaidTotal, calendarYear, room, firstBillPaid)}
                                                    className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold text-brand-gray-300 transition-all flex items-center gap-2"
                                                >
                                                    <Download className="w-3.5 h-3.5 text-brand-orange-500" /> พิมพ์รายงาน
                                                </button>
                                            </div>
                                        </div>

                                        {/* Yearly / Selected Summary Card */}
                                        <div className={`rounded-2xl border p-4 transition-all ${selectedMonths.size > 0 ? 'bg-brand-orange-500/5 border-brand-orange-500/20' : 'bg-brand-card/40 border-white/8'} `}>
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">
                                                    {selectedMonths.size > 0 ? `เลือก ${selectedMonths.size} เดือน` : `รวมทั้งปี ${calendarYear + 543} `}
                                                </p>
                                                {selectedMonths.size > 0 && (
                                                    <button
                                                        onClick={() => setSelectedMonths(new Set())}
                                                        className="text-[9px] font-semibold text-brand-orange-400 hover:text-brand-orange-300 transition-colors px-2 py-0.5 bg-brand-orange-500/10 rounded-full"
                                                    >
                                                        ล้างการเลือก
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-baseline gap-2">
                                                    <span className={`text-3xl font-black tracking-tight ${selectedMonths.size > 0 ? 'text-brand-orange-500' : 'text-white'} `}>
                                                        {(selectedMonths.size > 0 ? selectedTotal : yearTotal).toLocaleString()}
                                                    </span>
                                                    <span className="text-sm font-medium text-brand-gray-500">บาท</span>
                                                </div>
                                                {selectedMonths.size === 1 && (() => {
                                                    const mkey = [...selectedMonths][0];
                                                    const pay = paymentMap[mkey];
                                                    if (!pay) return null;
                                                    return (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handlePrintBill(pay);
                                                            }}
                                                            className="ml-auto flex items-center gap-2 px-3 py-2 bg-brand-orange-500/10 hover:bg-brand-orange-500/20 border border-brand-orange-500/20 rounded-xl text-[10px] font-bold text-brand-orange-500 transition-all active:scale-95 shadow-sm"
                                                        >
                                                            <Printer className="w-3.5 h-3.5" /> พิมพ์บิล
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                            {!paymentsLoading && (
                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className="flex items-center gap-1">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                                        <span className="text-[9px] font-medium text-brand-gray-500">
                                                            จ่ายแล้ว {(selectedMonths.size > 0
                                                                ? [...selectedMonths].filter(mk => paymentMap[mk]?.status === 'paid').reduce((s, mk) => s + (paymentMap[mk]?.amount || 0), 0)
                                                                : yearPaidTotal
                                                            ).toLocaleString()} บ.
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <div className="w-2 h-2 rounded-full bg-yellow-400" />
                                                        <span className="text-[9px] font-medium text-brand-gray-500">
                                                            ค้างชำระ {(selectedMonths.size > 0
                                                                ? [...selectedMonths].filter(mk => paymentMap[mk] && paymentMap[mk].status !== 'paid').reduce((s, mk) => s + (paymentMap[mk]?.amount || 0), 0)
                                                                : yearPayments.filter(p => p.status !== 'paid').reduce((s, p) => s + (p.amount || 0), 0)
                                                            ).toLocaleString()} บ.
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            <p className="text-[9px] text-brand-gray-600 mt-2 italic">แตะเดือนเพื่อเลือกดูยอดรวม</p>
                                        </div>

                                        {/* Content based on View Mode */}
                                        {paymentsLoading ? (
                                            <div className="flex items-center justify-center py-8">
                                                <div className="w-6 h-6 border-2 border-brand-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : billViewMode === 'calendar' ? (
                                            <div className="grid grid-cols-3 gap-2">
                                                {Array.from({ length: 12 }, (_, i) => {
                                                    const monthIdx = i + 1;
                                                    const monthKey = `${calendarYear}-${String(monthIdx).padStart(2, '0')}`;
                                                    const payment = paymentMap[monthKey];
                                                    const isCurrent = monthKey === currentMonthKey;
                                                    const isFuture = calendarYear > yearNow || (calendarYear === yearNow && monthIdx > now.getMonth() + 1);
                                                    const isPaid = payment?.status === 'paid';
                                                    const isPending = payment && payment.status !== 'paid';
                                                    const isSelected = selectedMonths.has(monthKey);
                                                    const hasPayment = isPaid || isPending;

                                                    let bgClass, borderClass, statusIcon, statusText, statusColor;
                                                    if (isPaid) {
                                                        bgClass = 'bg-emerald-500/8';
                                                        borderClass = 'border-emerald-500/20';
                                                        statusIcon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
                                                        statusText = 'จ่ายแล้ว';
                                                        statusColor = 'text-emerald-400';
                                                    } else if (isPending) {
                                                        bgClass = 'bg-yellow-500/8';
                                                        borderClass = 'border-yellow-500/20';
                                                        statusIcon = <Clock className="w-3.5 h-3.5 text-yellow-400" />;
                                                        statusText = 'รอชำระ';
                                                        statusColor = 'text-yellow-400';
                                                    } else if (isFuture) {
                                                        bgClass = 'bg-white/2';
                                                        borderClass = 'border-white/5';
                                                        statusIcon = null;
                                                        statusText = '';
                                                        statusColor = 'text-brand-gray-700';
                                                    } else {
                                                        bgClass = 'bg-brand-card/30';
                                                        borderClass = 'border-white/5';
                                                        statusIcon = <div className="w-3.5 h-3.5 rounded-full border border-brand-gray-700" />;
                                                        statusText = 'ไม่มีบิล';
                                                        statusColor = 'text-brand-gray-600';
                                                    }

                                                    return (
                                                        <button
                                                            key={monthKey}
                                                            onClick={() => !isFuture && hasPayment && toggleMonth(monthKey)}
                                                            disabled={isFuture || !hasPayment}
                                                            className={`relative p-3.5 rounded-2xl border transition-all duration-200 text-left ${bgClass} ${borderClass} ${isCurrent ? 'ring-1 ring-brand-orange-500/40' : ''} ${isFuture ? 'opacity-30 cursor-default' : hasPayment ? 'cursor-pointer active:scale-[0.97]' : 'cursor-default'} ${isSelected ? 'ring-2 ring-brand-orange-500 shadow-lg shadow-brand-orange-500/10' : ''} `}
                                                        >
                                                            {/* Selection indicator */}
                                                            {isSelected && (
                                                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand-orange-500 flex items-center justify-center">
                                                                    <CheckCircle2 className="w-3 h-3 text-brand-bg" />
                                                                </div>
                                                            )}

                                                            {/* Current month indicator */}
                                                            {isCurrent && !isSelected && (
                                                                <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-orange-500 animate-pulse" />
                                                            )}

                                                            <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isCurrent ? 'text-brand-orange-400' : 'text-brand-gray-500'} `}>
                                                                {thMonths[i]}
                                                            </p>
                                                            <p className={`text-xs font-medium mb-2 ${isCurrent ? 'text-white' : 'text-brand-gray-400'} `}>
                                                                {thMonthsFull[i]}
                                                            </p>

                                                            <div className="flex items-center gap-1.5">
                                                                {statusIcon}
                                                                <span className={`text-[9px] font-semibold ${statusColor} `}>
                                                                    {statusText}
                                                                </span>
                                                            </div>

                                                            {isPaid && payment?.amount && (
                                                                <p className="text-xs font-bold text-emerald-400 mt-1.5">
                                                                    {payment.amount.toLocaleString()} ฿
                                                                </p>
                                                            )}
                                                            {isPending && payment?.amount && (
                                                                <p className="text-xs font-bold text-yellow-400 mt-1.5">
                                                                    {payment.amount.toLocaleString()} ฿
                                                                </p>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {yearPayments.length > 0 ? (
                                                    yearPayments.map((p, idx) => (
                                                        <button
                                                            key={p.id}
                                                            onClick={() => setSelectedPayment(p)}
                                                            className="w-full bg-brand-card/50 p-4 rounded-2xl border border-white/8 flex items-center gap-3 hover:border-brand-orange-500/30 transition-all text-left"
                                                        >
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'} `}>
                                                                {p.status === 'paid' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-white truncate">
                                                                    {new Date(p.month + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                                                                </p>
                                                                <p className="text-[10px] font-medium text-brand-gray-500 mt-0.5">สถานะ: {p.status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'}</p>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <p className="text-sm font-bold text-white">{p.amount?.toLocaleString()} บ.</p>
                                                                <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${p.status === 'paid' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'} `}>
                                                                    {p.status === 'paid' ? 'จ่ายแล้ว' : 'ค้าง'}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="bg-brand-card/20 p-8 rounded-2xl border border-dashed border-white/5 text-center">
                                                        <p className="text-xs font-medium text-brand-gray-600">ไม่มีข้อมูลในปีนี้</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Legend */}
                                        <div className="flex items-center justify-center gap-4 pt-2">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                                                <span className="text-[9px] font-medium text-brand-gray-500">จ่ายแล้ว</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                                                <span className="text-[9px] font-medium text-brand-gray-500">รอชำระ</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2.5 h-2.5 rounded-full border border-brand-gray-600" />
                                                <span className="text-[9px] font-medium text-brand-gray-500">ไม่มีบิล</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })()}

                {activeTab === 'maintenance' && (
                    <div className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-white leading-tight">แจ้งซ่อมบำรุง</h1>
                                <p className="text-brand-gray-500 font-medium text-xs uppercase tracking-wider mt-1">Maintenance Request System</p>
                            </div>
                            <div className="w-12 h-12 bg-brand-orange-500/10 rounded-2xl flex items-center justify-center text-brand-orange-500">
                                <Activity size={24} />
                            </div>
                        </div>

                        <div className="bg-brand-card/80 p-6 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md">
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-brand-orange-500 uppercase tracking-wider ml-1">หัวข้อเรื่อง</label>
                                    <input
                                        type="text"
                                        value={maintenanceForm.title}
                                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                                        placeholder="เช่น ก๊อกน้ำรั่ว, ไฟดับ..."
                                        className="w-full bg-brand-bg rounded-2xl px-5 py-3.5 border border-white/10 outline-none font-medium text-white placeholder:text-white/20 focus:border-brand-orange-500/50 transition-all text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-brand-orange-500 uppercase tracking-wider ml-1">ระดับความสำคัญ</label>
                                    <div className="flex gap-2">
                                        {['ปกติ', 'ด่วน', 'ฉุกเฉิน'].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setMaintenanceForm({ ...maintenanceForm, priority: v })}
                                                className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all border ${maintenanceForm.priority === v ? 'bg-brand-orange-500 text-brand-bg border-brand-orange-500 shadow-lg shadow-brand-orange-500/20' : 'bg-brand-bg/50 text-brand-gray-400 border-white/5 hover:border-white/10'} `}
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-brand-orange-500 uppercase tracking-wider ml-1">รายละเอียด</label>
                                    <textarea
                                        rows="3"
                                        value={maintenanceForm.description}
                                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
                                        placeholder="อธิบายปัญหาที่คุณพบ..."
                                        className="w-full bg-brand-bg rounded-2xl px-5 py-4 border border-white/10 outline-none font-medium text-white placeholder:text-white/20 resize-none focus:border-brand-orange-500/50 transition-all text-sm"
                                    ></textarea>
                                </div>
                                <button
                                    onClick={handleSubmitMaintenance}
                                    disabled={submitting}
                                    className="w-full py-4 bg-gradient-to-r from-brand-orange-500 to-orange-400 text-brand-bg rounded-2xl font-semibold uppercase tracking-wider text-sm shadow-xl shadow-brand-orange-500/20 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {submitting ? 'กำลังส่ง...' : 'ยืนยันการแจ้งเรื่อง'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-medium text-brand-gray-500 uppercase tracking-widest ml-2">ประวัติรายการ</h3>
                            <div className="space-y-3 min-h-[200px]">
                                {maintenanceRequests.length === 0 ? (
                                    <div className="bg-brand-card/30 border border-dashed border-white/5 rounded-2xl p-10 text-center">
                                        <p className="text-brand-gray-600 font-medium text-sm">ไม่มีประวัติรายการ</p>
                                    </div>
                                ) : (
                                    maintenanceRequests.map((req, idx) => (
                                        <div key={req.id} className="bg-brand-card/50 p-5 rounded-2xl border border-white/10 relative overflow-hidden group animate-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 100} ms` }}>
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="text-sm font-semibold text-white">{req.title}</h4>
                                                    <p className="text-xs font-medium text-brand-gray-500 mt-0.5">
                                                        {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString('th-TH') : 'เพิ่งส่ง'}
                                                    </p>
                                                </div>
                                                <span className={`text-[9px] font-medium px-2.5 py-1 rounded-full uppercase tracking-wide border ${req.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/10' :
                                                    req.status === 'in-progress' ? 'bg-blue-500/10 text-blue-500 border-blue-500/10' :
                                                        'bg-emerald-500/10 text-emerald-500 border-emerald-500/10'
                                                    } `}>
                                                    {req.status === 'pending' ? 'รอดำเนินการ' : req.status === 'in-progress' ? 'กำลังซ่อม' : 'เสร็จสิ้น'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-brand-gray-400 font-normal leading-relaxed mb-4 line-clamp-2">{req.description}</p>
                                            <div className="bg-brand-bg/50 px-3 py-2 rounded-xl flex items-center justify-between border border-white/5">
                                                <span className={`text-xs font-medium ${req.priority === 'ปกติ' ? 'text-brand-gray-500' : req.priority === 'ด่วน' ? 'text-orange-400' : 'text-red-500'} `}>
                                                    ความสำคัญ: {req.priority}
                                                </span>
                                                <ArrowUpRight size={14} className="text-brand-gray-700" />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="space-y-8 pb-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
                        <div className="text-center pt-8">
                            <div className="w-28 h-28 bg-brand-card rounded-2xl border-2 border-brand-orange-500/20 p-1 mx-auto mb-6 relative">
                                <div className="w-full h-full bg-brand-bg rounded-[1.5rem] flex items-center justify-center text-white font-bold text-4xl overflow-hidden shadow-2xl uppercase">
                                    {user?.photoURL ? <img src={user.photoURL} alt="" /> : (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U')}
                                </div>
                                <div className="absolute bottom-2 right-2 w-8 h-8 bg-emerald-500 rounded-full border-4 border-brand-bg flex items-center justify-center">
                                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                                </div>
                            </div>
                            <h2 className="text-2xl font-bold text-white">{user?.displayName || user?.email?.split('@')[0] || 'User'}</h2>
                            <p className="text-xs font-medium text-brand-orange-500 uppercase tracking-wider mt-1 mb-4">ผู้เช่า</p>
                            <div className="inline-flex items-center gap-2 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                <span className="text-xs font-normal text-brand-gray-400">{user?.email}</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-medium text-brand-gray-500 uppercase tracking-widest ml-4">ตั้งค่าบัญชี</h3>
                            <div className="bg-brand-card/50 rounded-[1.5rem] border border-white/10 overflow-hidden divide-y divide-white/5">
                                <button
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-brand-gray-500 group-hover:text-brand-orange-500 transition-colors">
                                            <User size={18} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-white">จัดการโปรไฟล์และความปลอดภัย</p>
                                            <p className="text-xs font-normal text-brand-gray-500 mt-0.5">รูปโปรไฟล์ ชื่อ และรหัสผ่าน</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-brand-gray-700" />
                                </button>
                                <button
                                    onClick={() => navigate('/tenant-history')}
                                    className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-all group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-brand-gray-500 group-hover:text-brand-orange-500 transition-colors">
                                            <History size={18} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-white">ประวัติการเช่า</p>
                                            <p className="text-xs font-normal text-brand-gray-500 mt-0.5">รวมข้อมูลหอพักที่เคยพักและยอดชำระ</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-brand-gray-700" />
                                </button>
                            </div>
                        </div>

                        <div className="pt-4">
                            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-3 p-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl border border-red-500/10 transition-all font-medium text-sm">
                                <LogOut size={18} /> ออกจากระบบ
                            </button>
                            <p className="text-center text-[9px] font-normal text-brand-gray-700 uppercase tracking-widest mt-6">GrowApart v1.0.2</p>
                        </div>
                    </div>
                )}
            </main>

            {/* ── First Bill Print Modal ────────────────────── */}
            {showFirstBillModal && myRooms[0] && (() => {
                const room = myRooms[0];
                const apt = apartmentDetails[room.apartmentId];
                const items = getFirstBillItems(room, apt);
                const total = items.reduce((s, i) => s + i.amount, 0);
                const bankDetails = apt?.bankDetails || {};

                return (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowFirstBillModal(false)} />
                        <div className="relative bg-brand-card w-full max-w-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <button onClick={() => setShowFirstBillModal(false)} className="absolute top-4 right-4 z-10 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                                <X className="w-3.5 h-3.5 text-brand-gray-400" />
                            </button>

                            <div className="max-h-[85vh] overflow-y-auto custom-scrollbar">
                                <div ref={firstBillPrintRef} className="bg-white text-black p-8">
                                    <div className="text-center mb-6 border-b-2 border-slate-800 pb-4">
                                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">ใบแจ้งค่าแรกเข้า</h2>
                                        <p className="text-sm text-slate-500 font-medium">ห้อง {room.roomNumber} | ชั้น {room.floor}</p>
                                    </div>

                                    <div className="space-y-4 mb-6">
                                        <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">ผู้เช่า</span>
                                            <span className="font-black text-slate-900">{user?.displayName || user?.email?.split('@')[0] || '-'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">วันที่</span>
                                            <span className="font-bold text-slate-900">{new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">รายละเอียดค่าใช้จ่าย</h4>
                                        <div className="space-y-2">
                                            {items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center py-1">
                                                    <span className="text-slate-700 text-sm font-medium">{item.label}</span>
                                                    <span className="text-slate-900 text-sm font-black">{item.amount.toLocaleString()} บ.</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-between items-center mt-4 pt-4 border-t-2 border-slate-800">
                                            <span className="text-slate-900 text-lg font-black italic">รวมทั้งสิ้น</span>
                                            <span className="text-slate-900 text-2xl font-black">{total.toLocaleString()} บ.</span>
                                        </div>
                                    </div>

                                    {bankDetails.promptpay && (
                                        <div className="text-center py-6 border-t border-dashed border-slate-200 mt-6">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">สแกนเพื่อชำระเงิน (PromptPay)</p>
                                            <div className="inline-block p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm mb-4">
                                                <QRCodeSVG value={bankDetails.promptpay} size={160} />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-xs font-black text-slate-900 leading-none">{bankDetails.accountName || 'ชื่อบัญชี'}</p>
                                                <p className="text-[11px] font-bold text-slate-500 leading-none">{bankDetails.promptpay}</p>
                                            </div>
                                            {bankDetails.name && (
                                                <p className="mt-3 text-[10px] text-slate-400 font-medium">
                                                    {bankDetails.name} : {bankDetails.accountNo}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div className="text-center mt-8 pt-4 border-t border-slate-100">
                                        <p className="text-[9px] text-slate-300 font-medium italic">ใบแจ้งหนี้นี้ออกโดยระบบ GrowApart</p>
                                    </div>
                                </div>

                                <div className="p-6 bg-brand-bg/50 border-t border-white/10 flex gap-3">
                                    <button
                                        onClick={handlePrintFirstBill}
                                        className="flex-1 py-3 bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg rounded-2xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-brand-orange-500/20"
                                    >
                                        <Printer className="w-4 h-4" /> ปริ้นบิล
                                    </button>
                                    <button
                                        onClick={() => setShowFirstBillModal(false)}
                                        className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        ปิด
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Bottom Navigation Navbar */}
            <nav className="fixed bottom-0 left-0 right-0 z-[100] px-6 pb-8 pt-4 lg:hidden">
                <div className="bg-brand-bg/80 backdrop-blur-2xl border border-white/10 rounded-2xl px-5 py-3 shadow-2xl shadow-black/40 flex items-center justify-between">
                    {NavItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => {
                                if (item.id === 'history') {
                                    navigate('/tenant-history');
                                } else {
                                    setActiveTab(item.id);
                                }
                            }}
                            className={`flex flex-col items-center gap-1.5 p-2 transition-all relative ${activeTab === item.id ? 'text-brand-orange-500' : 'text-brand-gray-600 hover:text-brand-gray-300'
                                } `}
                        >
                            <div className={`p-2 rounded-2xl transition-all ${activeTab === item.id ? 'bg-brand-orange-500/20 shadow-lg shadow-brand-orange-500/10 scale-110' : ''
                                } `}>
                                {item.icon}
                            </div>
                            <span className={`text-[9px] font-medium ${activeTab === item.id ? 'opacity-100 text-brand-orange-500' : 'opacity-40'} `}>
                                {item.label}
                            </span>
                            {activeTab === item.id && (
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-brand-orange-500 rounded-full"></div>
                            )}
                        </button>
                    ))}
                </div>
            </nav>
            {/* ── Bill Details Modal ──────────────────────── */}
            {selectedPayment && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedPayment(null)} />
                    <div className="relative bg-brand-card w-full max-w-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-white">รายละเอียดบิล</h3>
                                <p className="text-[10px] text-brand-gray-500 uppercase tracking-widest font-bold">
                                    {new Date(selectedPayment.month + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handlePrintBill(selectedPayment)}
                                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-brand-orange-500 transition-colors"
                                    title="พิมพ์บิล"
                                >
                                    <Printer size={16} />
                                </button>
                                <button onClick={() => setSelectedPayment(null)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-brand-gray-400">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-gray-400 font-medium tracking-tight">ค่าเช่าห้อง</span>
                                    <span className="text-white font-bold">{(selectedPayment.details?.rent || 0).toLocaleString()} บ.</span>
                                </div>
                                {selectedPayment.details?.electricity && (
                                    <div className="flex justify-between items-start text-sm">
                                        <div className="flex flex-col">
                                            <span className="text-brand-gray-400 font-medium tracking-tight">ค่าไฟฟ้า ({selectedPayment.details.electricity.units} หน่วย)</span>
                                            <span className="text-[10px] text-brand-gray-600 font-bold">{selectedPayment.details.electricity.old} - {selectedPayment.details.electricity.new}</span>
                                        </div>
                                        <span className="text-white font-bold">{(selectedPayment.details.electricity.amount || 0).toLocaleString()} บ.</span>
                                    </div>
                                )}
                                {selectedPayment.details?.water && (
                                    <div className="flex justify-between items-start text-sm">
                                        <div className="flex flex-col">
                                            <span className="text-brand-gray-400 font-medium tracking-tight">ค่าน้ำ ({selectedPayment.details.water.units} หน่วย)</span>
                                            <span className="text-[10px] text-brand-gray-600 font-bold">{selectedPayment.details.water.old} - {selectedPayment.details.water.new}</span>
                                        </div>
                                        <span className="text-white font-bold">{(selectedPayment.details.water.amount || 0).toLocaleString()} บ.</span>
                                    </div>
                                )}
                                {(selectedPayment.details?.fixedExpenses || []).map((ex, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm">
                                        <span className="text-brand-gray-400 font-medium tracking-tight">{ex.name}</span>
                                        <span className="text-white font-bold">{(ex.amount || 0).toLocaleString()} บ.</span>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-6 border-t border-white/10">
                                <div className="flex justify-between items-end">
                                    <span className="text-brand-gray-500 font-black italic uppercase text-xs">รวมทั้งสิ้น</span>
                                    <div className="text-right">
                                        <h2 className="text-3xl font-black text-brand-orange-500 leading-none">
                                            {(selectedPayment.amount || 0).toLocaleString()}
                                        </h2>
                                        <span className="text-[10px] font-bold text-brand-gray-600 uppercase tracking-widest mt-1 block">บาท</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-brand-orange-500/5 border border-brand-orange-500/10 p-4 rounded-2xl flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedPayment.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                                    {selectedPayment.status === 'paid' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest leading-none mb-1">สถานะปัจจุบัน</p>
                                    <p className={`text-sm font-black ${selectedPayment.status === 'paid' ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                        {selectedPayment.status === 'paid' ? 'ชำระเงินเรียบร้อยแล้ว' : 'ยังไม่ได้ชำระเงิน'}
                                    </p>
                                </div>
                            </div>

                            {selectedPayment.status !== 'paid' && primaryApt?.bankDetails && (
                                <div className="space-y-4 pt-2">
                                    <div className="text-center">
                                        <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest mb-3">ชำระผ่าน PromptPay</p>
                                        <div className="bg-white p-4 rounded-2xl inline-block shadow-xl">
                                            <QRCodeSVG
                                                value={`https://promptpay.io/${primaryApt.bankDetails.promptpay}/${selectedPayment.amount}`}
                                                size={160}
                                            />
                                        </div >
                                    </div >
                                </div >
                            )
                            }
                        </div >
                    </div >
                </div >
            )}
            {/* ── Print Preview Modal ──────────────────────── */}
            {
                showPrintPreview && printData && (
                    <div className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-md overflow-y-auto">
                        <div className="fixed inset-0" onClick={() => setShowPrintPreview(false)} />

                        <div className="relative min-h-screen flex flex-col items-center justify-start p-4 py-12 pointer-events-none">
                            <div className="relative w-full max-w-[450px] pointer-events-auto">
                                {/* Action Buttons */}
                                <div className="flex justify-between items-center px-1 mb-6">
                                    <button
                                        onClick={() => setShowPrintPreview(false)}
                                        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors bg-white/20 px-4 py-2.5 rounded-2xl backdrop-blur-md border border-white/10"
                                    >
                                        <X size={18} />
                                        <span className="text-sm font-bold">ปิดหน้าต่าง</span>
                                    </button>
                                    <button
                                        onClick={executePrint}
                                        className="flex items-center gap-2 bg-brand-orange-500 hover:bg-brand-orange-400 text-brand-bg px-6 py-2.5 rounded-2xl transition-all active:scale-95 shadow-xl shadow-brand-orange-500/30"
                                    >
                                        <Printer size={18} />
                                        <span className="text-sm font-black text-brand-bg uppercase">สั่งพิมพ์</span>
                                    </button>
                                </div>

                                {/* The Receipt Preview */}
                                <div className="bg-white rounded-[2rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                                    {(() => {
                                        const apt = apartmentDetails[printData.apartmentId];
                                        const mIdx = parseInt(printData.month.split('-')[1]) - 1;
                                        const thMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
                                        const monthStr = `${thMonthsFull[mIdx]} ${parseInt(printData.month.split('-')[0]) + 543}`;
                                        const items = [
                                            { label: 'ค่าเช่าห้อง', amount: printData.details?.rent || 0 },
                                            ...(printData.details?.electricity ? [{
                                                label: 'ค่าไฟฟ้า',
                                                amount: printData.details.electricity.amount,
                                                desc: `${printData.details.electricity.old} - ${printData.details.electricity.new} (${printData.details.electricity.units} หน่วย)`
                                            }] : []),
                                            ...(printData.details?.water ? [{
                                                label: 'ค่าน้ำ',
                                                amount: printData.details.water.amount,
                                                desc: `${printData.details.water.old} - ${printData.details.water.new} (${printData.details.water.units} หน่วย)`
                                            }] : []),
                                            ...(printData.details?.fixedExpenses || []).map(ex => ({ label: ex.name, amount: ex.amount }))
                                        ];

                                        return (
                                            <div className="p-8 text-slate-900 font-sarabun">
                                                <div className="text-center mb-10 pb-6 border-b-2 border-dashed border-slate-100">
                                                    <h2 className="text-2xl font-black text-brand-orange-500 mb-1">{apt?.general?.name || 'หอพัก'}</h2>
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">ใบแจ้งหนี้ประจำเดือน</p>
                                                </div>

                                                <div className="space-y-4 mb-10 pb-6 border-b-2 border-dashed border-slate-100">
                                                    <div className="flex justify-between items-end">
                                                        <div>
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">เลขห้อง</p>
                                                            <p className="text-xl font-black text-slate-900">{printData.roomNumber}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">รอบบิล</p>
                                                            <p className="text-lg font-bold text-slate-900">{monthStr}</p>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">สถานะการชำระ</p>
                                                        <span className={`px-4 py-1.5 rounded-full text-xs font-black ${printData.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                                            {printData.status === 'paid' ? 'ชำระเงินเรียบร้อยแล้ว' : 'รอการเริ่มชำระ'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mb-10">
                                                    <div className="flex justify-between items-center mb-4 px-1">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">รายการ / รายละเอียด</p>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">จำนวนเงิน</p>
                                                    </div>
                                                    <div className="space-y-4">
                                                        {items.map((item, idx) => (
                                                            <div key={idx} className="flex justify-between items-start">
                                                                <div className="flex-1">
                                                                    <p className="text-sm font-bold text-slate-800">{item.label}</p>
                                                                    {item.desc && <p className="text-[10px] font-medium text-slate-400 mt-0.5">{item.desc}</p>}
                                                                </div>
                                                                <p className="text-sm font-black text-slate-900 ml-4">{item.amount.toLocaleString()} ฿</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="bg-slate-50 rounded-3xl p-6 text-center mb-10 border border-slate-100">
                                                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2 italic">รวมทั้งสิ้น</p>
                                                    <div className="flex items-baseline justify-center gap-1.5">
                                                        <span className="text-5xl font-black text-slate-900 tabular-nums tracking-tighter">{printData.amount.toLocaleString()}</span>
                                                        <span className="text-lg font-black text-slate-400 uppercase">บาท</span>
                                                    </div>
                                                </div>

                                                {printData.status !== 'paid' && apt?.bankDetails?.promptpay && (
                                                    <div className="text-center mb-10 p-6 rounded-[2rem] border-2 border-dashed border-slate-100">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 leading-relaxed">สแกนชำระเงินผ่าน PromptPay</p>
                                                        <div className="bg-white p-4 rounded-[1.5rem] inline-block shadow-xl shadow-slate-200/50 mb-6">
                                                            <QRCodeSVG
                                                                value={`https://promptpay.io/${apt.bankDetails.promptpay}/${printData.amount}`}
                                                                size={160}
                                                            />
                                                        </div>
                                                        <p className="text-sm font-black text-slate-900">{apt.bankDetails.accountName}</p>
                                                        <p className="text-xs font-bold text-slate-400 mt-1">{apt.bankDetails.promptpay}</p>
                                                    </div>
                                                )}

                                                <div className="text-center pt-8 border-t-2 border-dashed border-slate-100">
                                                    <p className="text-sm font-black text-slate-500 mb-1 italic">ขอบคุณที่ใช้บริการ</p>
                                                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                                                        Issued by GrowApart • {new Date().toLocaleDateString('th-TH', {
                                                            day: '2-digit', month: 'long', year: 'numeric',
                                                            hour: '2-digit', minute: '2-digit'
                                                        })}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
}
