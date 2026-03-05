import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { Building, Phone, User as UserIcon, Lock, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

export default function StaffJoin({ user }) {
    const { aptId } = useParams();
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [apartment, setApartment] = useState(null);
    const [requestStatus, setRequestStatus] = useState(null); // 'pending', 'approved', null
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    useEffect(() => {
        async function checkData() {
            try {
                // Fetch apartment details
                const aptRef = doc(db, 'apartments', aptId);
                const aptSnap = await getDoc(aptRef);
                if (aptSnap.exists()) {
                    setApartment(aptSnap.data());
                }

                // Check for existing request if logged in
                if (user) {
                    const q = query(
                        collection(db, 'requests'),
                        where('userId', '==', user.uid),
                        where('apartmentId', '==', aptId),
                        where('type', '==', 'staff')
                    );
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const reqStatus = snap.docs[0].data().status;
                        setRequestStatus(reqStatus);
                    }
                }
            } catch (error) {
                console.error("Error fetching data:", error);
                showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
            }
            setLoading(false);
        }
        checkData();
    }, [aptId, user, showToast]);

    const handleJoinRequest = async (e) => {
        e.preventDefault();

        if (!phone || !password || (!user && !name)) {
            return showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
        }

        setSubmitting(true);
        let currentUser = user;

        try {
            if (!currentUser) {
                // Authenticate or Register using Phone as Email
                const fakeEmail = `${phone.replace(/\D/g, '')}@growapart.system`;
                try {
                    // Try to login first
                    const userCredential = await signInWithEmailAndPassword(auth, fakeEmail, password);
                    currentUser = userCredential.user;
                } catch (loginError) {
                    if (loginError.code === 'auth/invalid-credential' || loginError.code === 'auth/user-not-found') {
                        // Register if not found
                        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
                        currentUser = userCredential.user;

                        // Create user doc
                        await setDoc(doc(db, 'users', currentUser.uid), {
                            name: name,
                            phone: phone,
                            email: fakeEmail,
                            role: 'manager', // Default to manager role for staff
                            createdAt: serverTimestamp()
                        });
                    } else {
                        throw loginError;
                    }
                }
            }

            // Check if already requested
            const q = query(
                collection(db, 'requests'),
                where('userId', '==', currentUser.uid),
                where('apartmentId', '==', aptId),
                where('type', '==', 'staff')
            );
            const snap = await getDocs(q);

            if (snap.empty) {
                // Submit request
                await addDoc(collection(db, 'requests'), {
                    userId: currentUser.uid,
                    userName: name || currentUser.displayName || 'พนักงาน',
                    userEmail: currentUser.email,
                    userPhone: phone,
                    apartmentId: aptId,
                    apartmentName: apartment?.general?.name || 'Unknown',
                    type: 'staff',
                    status: 'pending',
                    createdAt: serverTimestamp()
                });
                setRequestStatus('pending');
                showToast('ส่งคำขอเข้าระบบเรียบร้อยแล้ว กรุณารอเจ้าของหออนุมัติ', 'success');
            } else {
                setRequestStatus(snap.docs[0].data().status);
            }
        } catch (error) {
            console.error("Join request failed:", error);
            if (error.code === 'auth/wrong-password') {
                showToast('รหัสผ่านไม่ถูกต้อง สำหรับเบอร์โทรนี้', 'error');
            } else if (error.code === 'auth/weak-password') {
                showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
            } else {
                showToast('ส่งคำขอล้มเหลว กรุณาลองใหม่อีกครั้ง', 'error');
            }
        }
        setSubmitting(false);
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-brand-bg">
                <Loader2 className="w-12 h-12 text-brand-orange-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 relative overflow-hidden">
            <Toast {...toast} onClose={hideToast} />

            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-brand-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="max-w-md w-full bg-brand-card rounded-xl p-8 shadow-lg border border-white/10 relative z-10 animate-in zoom-in-95 duration-500">
                <div className="w-16 h-16 bg-brand-orange-500/20 rounded-xl flex items-center justify-center text-brand-orange-500 shadow-md mx-auto mb-5 border border-brand-orange-500/30">
                    <UserIcon className="w-8 h-8" />
                </div>

                <div className="text-center mb-6">
                    <h1 className="text-xl font-bold text-white mb-1 uppercase tracking-tight">สมัครเป็นพนักงาน</h1>
                    <p className="text-brand-gray-500 font-bold text-sm tracking-wide">STAFF REGISTRATION</p>
                </div>

                <div className="bg-brand-bg/50 rounded-xl p-4 border border-white/10 mb-6 text-center">
                    <span className="text-xs font-bold text-brand-gray-500 uppercase tracking-widest block mb-1">หอพัก</span>
                    <span className="text-white font-bold text-lg">{apartment?.general?.name || 'ไม่พบข้อมูล'}</span>
                </div>

                {requestStatus === 'pending' ? (
                    <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20 text-center animate-pulse mt-4">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
                        <p className="text-emerald-500 font-bold text-sm">ส่งคำขอแล้ว! กรุณารอเจ้าของหออนุมัติ</p>
                        <p className="text-brand-gray-400 text-xs mt-2 font-medium tracking-wide">จะมีการแจ้งเตือนเมื่อคุณได้รับการอนุมัติสิทธิ์พนักงาน</p>
                    </div>
                ) : requestStatus === 'approved' ? (
                    <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20 text-center mt-4">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
                        <p className="text-emerald-500 font-bold text-sm">คุณเป็นพนักงานของหอพักนี้แล้ว</p>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="mt-4 w-full py-2.5 bg-brand-orange-500 text-brand-bg rounded-xl font-bold uppercase text-xs"
                        >
                            ไปที่หน้าโฮมเพจ
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleJoinRequest} className="space-y-4">
                        {!user && (
                            <>
                                <div>
                                    <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">ชื่อ - นามสกุล</label>
                                    <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                                        <UserIcon className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                                        <input
                                            type="text"
                                            placeholder="สมชาย ใจดี"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 text-sm"
                                            required
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                        <div>
                            <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">เบอร์โทรศัพท์ (ใช้เข้าสู่ระบบ)</label>
                            <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                                <Phone className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                                <input
                                    type="tel"
                                    placeholder="08X-XXX-XXXX"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 text-sm"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">รหัสผ่าน</label>
                            <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                                <Lock className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 tracking-widest text-sm"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="text-brand-bg/30 hover:text-brand-bg/50 focus:outline-none ml-2"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-gradient-to-r from-[#e67e22] via-[#f39c12] to-[#f1c40f] hover:from-[#f39c12] hover:via-[#f1c40f] hover:to-[#fbc531] text-brand-bg font-extrabold py-2.5 rounded-xl mt-6 shadow-[0_4px_15px_-3px_rgba(243,156,18,0.4)] transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center border-b-2 border-orange-700/30"
                        >
                            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ลงทะเบียนและส่งคำขอ'}
                        </button>
                    </form>
                )}

                <button
                    onClick={() => navigate('/login')}
                    className="w-full mt-6 py-2.5 text-brand-gray-500 hover:text-white text-xs font-bold tracking-wide transition-colors"
                >
                    มีบัญชีอยู่แล้ว? เข้าสู่ระบบ
                </button>
            </div>
        </div>
    );
}
