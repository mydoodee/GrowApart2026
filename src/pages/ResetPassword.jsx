import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';

export default function ResetPassword() {
    const navigate = useNavigate();
    const location = useLocation();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [oobCode, setOobCode] = useState(null);

    useEffect(() => {
        const query = new URLSearchParams(location.search);
        const code = query.get('oobCode');
        if (code) {
            setOobCode(prev => prev !== code ? code : prev);
        } else {
            setError(prev => prev !== 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ' ? 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ' : prev);
        }
    }, [location]);

    const handleReset = async (e) => {
        e.preventDefault();
        if (!password || !confirmPassword) return setError('กรุณากรอกข้อมูลให้ครบถ้วน');
        if (password.length < 6) return setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
        if (password !== confirmPassword) return setError('รหัสผ่านไม่ตรงกัน');
        if (!oobCode) return setError('ไม่พบรหัสยืนยันการเปลี่ยนรหัสผ่าน');

        setError('');
        setLoading(true);

        try {
            await confirmPasswordReset(auth, oobCode, password);
            setSuccess(true);
            setTimeout(() => {
                navigate('/login', { replace: true });
            }, 3000);
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/expired-action-code') {
                setError('ลิงก์รีเซ็ตรหัสผ่านหมดอายุแล้ว กรุณาขอใหม่');
            } else if (err.code === 'auth/invalid-action-code') {
                setError('ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือเคยถูกใช้งานไปแล้ว');
            } else {
                setError('เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่');
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-[350px] bg-brand-card border border-brand-orange-500/30 rounded-xl px-7 py-5 shadow-[0_0_50px_-12px_rgba(243,156,18,0.15)] relative z-10 transition-all text-center">

                {/* LOGO */}
                <div className="flex justify-center mb-7">
                    <div className="flex items-center space-x-1 text-5xl font-bold tracking-tighter">
                        <span className="text-white">L</span>
                        <span className="text-brand-orange-500">K</span>
                    </div>
                </div>

                {success ? (
                    <div className="py-10 animate-in fade-in zoom-in duration-300">
                        <div className="flex justify-center mb-6">
                            <CheckCircle2 className="w-16 h-16 text-green-500" />
                        </div>
                        <h1 className="text-xl font-bold text-white mb-1 tracking-tight">ทำรายการสำเร็จ!</h1>
                        <p className="text-brand-gray-400 text-sm font-medium opacity-80 mb-5">
                            รหัสผ่านของคุณถูกเปลี่ยนเรียบร้อยแล้ว<br />กำลังนำคุณไปยังหน้าเข้าสู่ระบบ...
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full bg-brand-orange-500/10 text-brand-orange-500 font-bold py-2 rounded-xl hover:bg-brand-orange-500 hover:text-brand-bg transition-colors"
                        >
                            เข้าสู่ระบบทันที
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-5">
                            <h1 className="text-xl font-bold text-white mb-1 tracking-tight">ตั้งรหัสผ่านใหม่</h1>
                            <p className="text-brand-gray-400 text-sm font-medium opacity-80">
                                กรุณาระบุรหัสผ่านใหม่ที่คุณต้องการใช้งาน
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 text-red-500 text-xs p-3 rounded-xl mb-6 text-center">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleReset} className="space-y-4">
                            <div>
                                <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">รหัสผ่านใหม่</label>
                                <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                                    <Lock className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 tracking-widest text-sm"
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

                            <div>
                                <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">ยืนยันรหัสผ่านใหม่</label>
                                <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                                    <Lock className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 tracking-widest text-sm"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !oobCode}
                                className="w-full bg-gradient-to-r from-brand-orange-500 to-brand-orange-400 hover:from-brand-orange-400 hover:to-brand-orange-300 text-brand-bg font-extrabold py-2 rounded-xl mt-4 shadow-[0_4px_15px_-3px_rgba(243,156,18,0.4)] transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ยืนยันรหัสผ่านใหม่'}
                            </button>

                            <div className="text-center mt-6">
                                <button
                                    type="button"
                                    onClick={() => navigate('/login')}
                                    className="text-gray-500 text-xs font-medium hover:text-white transition-colors"
                                >
                                    ยกเลิกและ <span className="text-brand-orange-500 font-bold">เข้าสู่ระบบ</span>
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
