import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { User, Phone, Loader2, CheckCircle2 } from 'lucide-react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

export default function CompleteProfile({ user }) {
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name || user.displayName || '');
          setPhone(data.phone || '');
          setRole(data.role);
          
          // If already complete, redirect away
          if (data.name && data.phone) {
            if (data.role === 'tenant') {
              navigate('/tenant-dashboard', { replace: true });
            } else {
              navigate('/picker', { replace: true });
            }
          }
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        showToast('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้', 'error');
      }
      setLoading(false);
    };

    fetchProfile();
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
      return;
    }

    if (phone.replace(/\D/g, '').length < 9) {
      showToast('เบอร์โทรศัพท์ไม่ถูกต้อง', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: name.trim(),
        phone: phone.trim(),
        updatedAt: serverTimestamp()
      });

      showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
      
      // Navigate to correct dashboard based on role
      setTimeout(() => {
        if (role === 'tenant') {
          navigate('/tenant-dashboard', { replace: true });
        } else {
          navigate('/picker', { replace: true });
        }
      }, 1000);
      
    } catch (error) {
      console.error("Error updating profile:", error);
      showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    }
    setSubmitting(false);
  };

  if (loading) return <div className="flex h-screen w-full items-center justify-center bg-brand-bg"><Loader2 className="w-12 h-12 text-brand-orange-500 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 relative overflow-hidden">
      <Toast {...toast} onClose={hideToast} />
      
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-[400px] bg-brand-card/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-brand-orange-500/10 rounded-2xl flex items-center justify-center text-brand-orange-500 mx-auto mb-4 border border-brand-orange-500/20">
            <User className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">ข้อมูลเพิ่มเติม</h1>
          <p className="text-brand-gray-500 text-sm font-medium">กรุณากรอกข้อมูลของคุณให้ครบถ้วนเพื่อเริ่มใช้งานระบบ</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-brand-orange-500 uppercase tracking-widest px-1">ชื่อ - นามสกุลจริง</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-brand-orange-500 transition-colors">
                <User size={18} />
              </div>
              <input
                type="text"
                placeholder="ชื่อ และ นามสกุล"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 rounded-2xl pl-12 pr-4 py-4 text-white border border-white/10 focus:border-brand-orange-500 outline-none placeholder:text-white/10 transition-all font-medium"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-brand-orange-500 uppercase tracking-widest px-1">เบอร์โทรศัพท์มือถือ</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-brand-orange-500 transition-colors">
                <Phone size={18} />
              </div>
              <input
                type="tel"
                placeholder="0XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white/5 rounded-2xl pl-12 pr-4 py-4 text-white border border-white/10 focus:border-brand-orange-500 outline-none placeholder:text-white/10 transition-all font-medium"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-gradient-to-r from-brand-orange-600 to-brand-orange-400 text-brand-bg rounded-2xl font-bold uppercase tracking-widest text-sm shadow-xl shadow-brand-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'บันทึกและดำเนินการต่อ'}
          </button>
        </form>

        <div className="mt-8 text-center">
            <p className="text-[10px] text-brand-gray-600 font-bold uppercase tracking-[0.2em] mb-2">GrowApart 2026</p>
            <div className="w-10 h-1 bg-white/5 mx-auto rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
