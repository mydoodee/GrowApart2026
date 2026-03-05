import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  User as UserIcon,
  Building,
  Phone,
} from "lucide-react";
import Toast from "../components/Toast";
import { useToast } from '../hooks/useToast';

const GoogleIcon = () => (
  <svg className="w-5 h-4 mr-3" viewBox="0 0 48 48">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

export default function TenantLogin({ user }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const aptId =
    searchParams.get("aptId") || localStorage.getItem("activeApartmentId");
  const { toast, showToast, hideToast } = useToast();

  const [aptBranding, setAptBranding] = useState(null);

  const [step, setStep] = useState("LOGIN"); // 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authMethod, setAuthMethod] = useState("phone");

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (user && localStorage.getItem("loginContext") === "tenant") {
      navigate("/tenant-dashboard", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchBranding = async () => {
      if (!aptId) return;
      try {
        const aptRef = doc(db, "apartments", aptId);
        const aptSnap = await getDoc(aptRef);
        if (aptSnap.exists()) {
          setAptBranding({ id: aptSnap.id, ...aptSnap.data() });
        }
      } catch (error) {
        console.error("Error fetching apartment branding:", error);
      }
    };
    fetchBranding();
  }, [aptId]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let authEmail = email;
      if (authMethod === "phone") {
        const cleanPhone = (phone || "").replace(/\D/g, "");
        if (!cleanPhone) throw new Error("กรุณากรอกเบอร์โทรศัพท์");
        authEmail = `${cleanPhone}@growapart.system`;
      }

      const userCredential = await signInWithEmailAndPassword(auth, authEmail, password);

      // Check role
      const docRef = doc(db, "users", userCredential.user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists() && docSnap.data().role !== "tenant") {
        await auth.signOut();
        throw new Error("บัญชีนี้เป็นบัญชีผู้ดูแล/เจ้าของ กรุณาเข้าสู่ระบบผ่านหน้า Owner Portal");
      }

      localStorage.setItem("loginContext", "tenant");
      navigate("/tenant-dashboard", { replace: true });
    } catch (err) {
      console.error(err);
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found"
      ) {
        showToast("เบอร์โทรศัพท์/อีเมล หรือรหัสผ่านไม่ถูกต้อง", "error");
      } else {
        showToast(err.message || "เกิดข้อผิดพลาดในการเข้าสู่ระบบ", "error");
      }
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const docRef = doc(db, "users", result.user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        if (docSnap.data().role !== "tenant") {
          await auth.signOut();
          throw new Error("บัญชีนี้เป็นบัญชีผู้ดูแล/เจ้าของ กรุณาเข้าสู่ระบบผ่านหน้า Owner Portal");
        }
      } else {
        await setDoc(docRef, {
          name: result.user.displayName || "Tenant",
          email: result.user.email,
          role: "tenant",
          createdAt: serverTimestamp(),
        });
      }

      localStorage.setItem("loginContext", "tenant");
      navigate("/tenant-dashboard", { replace: true });
    } catch (err) {
      console.error(err);
      showToast(err.message || "การเข้าสู่ระบบด้วย Google ล้มเหลว", "error");
    }
    setLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      showToast("ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว กรุณาตรวจสอบอีเมล", "success");
      setStep("LOGIN");
    } catch (err) {
      console.error(err);
      showToast("เกิดข้อผิดพลาดในการส่งอีเมลรีเซ็ต", "error");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 relative overflow-hidden">
      <Toast {...toast} onClose={hideToast} />

      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-orange-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-[360px] bg-brand-card/90 backdrop-blur-xl border border-white/10 rounded-2xl px-8 py-10 shadow-2xl relative z-10 transition-all scale-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-orange-500/20 rounded-2xl flex items-center justify-center text-brand-orange-500 mx-auto mb-4 border border-brand-orange-500/30 overflow-hidden">
            {aptBranding?.general?.logoURL ? (
              <img
                src={aptBranding.general.logoURL}
                alt={aptBranding.general.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-8 h-8" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">
            {aptBranding?.general?.name ||
              (step === "LOGIN" ? "เข้าสู่ระบบผู้เช่า" : "ลืมรหัสผ่าน")}
          </h1>
          <p className="text-brand-gray-500 text-xs font-bold uppercase tracking-widest opacity-80">
            {aptBranding?.general?.name
              ? step === "LOGIN"
                ? "TENANT LOGIN"
                : "RECOVER ACCESS"
              : step === "LOGIN"
                ? "TENANT LOGIN"
                : "RECOVER ACCESS"}
          </p>
        </div>

        {step === "LOGIN" ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="flex bg-brand-bg rounded-xl p-1 border border-white/5">
              <button
                type="button"
                onClick={() => setAuthMethod("phone")}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${authMethod === "phone" ? "bg-brand-card text-brand-orange-500 shadow-sm" : "text-brand-gray-400"}`}
              >
                เบอร์โทรศัพท์
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod("email")}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${authMethod === "email" ? "bg-brand-card text-brand-orange-500 shadow-sm" : "text-brand-gray-400"}`}
              >
                อีเมล
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-brand-gray-500 uppercase px-1 tracking-widest">
                {authMethod === "phone" ? "เบอร์โทรศัพท์" : "อีเมล"}
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-brand-orange-500 transition-colors">
                  {authMethod === "phone" ? (
                    <Phone size={16} />
                  ) : (
                    <Mail size={16} />
                  )}
                </div>
                <input
                  type={authMethod === "phone" ? "tel" : "email"}
                  placeholder={
                    authMethod === "phone" ? "08X-XXX-XXXX" : "example@mail.com"
                  }
                  value={authMethod === "phone" ? phone : email}
                  onChange={(e) =>
                    authMethod === "phone"
                      ? setPhone(e.target.value)
                      : setEmail(e.target.value)
                  }
                  className="w-full bg-white/5 rounded-xl pl-11 pr-4 py-3 text-sm text-white border border-white/10 focus:border-brand-orange-500 outline-none placeholder:text-white/10 transition-all font-medium"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-widest">
                  รหัสผ่าน
                </label>
                <button
                  type="button"
                  onClick={() => setStep("FORGOT_PASSWORD")}
                  className="text-[10px] font-bold text-brand-gray-600 hover:text-white transition-colors"
                >
                  ลืมรหัสหรือไม่?
                </button>
              </div>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-brand-orange-500 transition-colors">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 rounded-xl pl-11 pr-12 py-3 text-sm text-white border border-white/10 focus:border-brand-orange-500 outline-none placeholder:text-white/10 transition-all font-medium"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-brand-orange-500 text-brand-bg rounded-xl font-bold uppercase text-xs tracking-widest shadow-lg shadow-brand-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "เข้าสู่ระบบ"
              )}
            </button>

            <div className="flex items-center gap-4 py-2">
              <div className="flex-1 h-px bg-white/5"></div>
              <span className="text-[8px] font-bold text-brand-gray-600 uppercase tracking-[0.2em]">
                OR LOGIN WITH
              </span>
              <div className="flex-1 h-px bg-white/5"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3.5 bg-white hover:bg-white/90 text-brand-bg rounded-xl font-bold text-[11px] uppercase tracking-wider flex items-center justify-center transition-all shadow-md active:scale-[0.98]"
            >
              <GoogleIcon /> Login with Google
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleResetPassword}
            className="space-y-6 animate-in slide-in-from-right duration-300"
          >
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-brand-gray-500 uppercase px-1 tracking-widest">
                อีเมลกู้คืน
              </label>
              <input
                type="email"
                placeholder="example@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-brand-orange-500 outline-none placeholder:text-white/10 transition-all font-medium"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-white text-brand-bg rounded-xl font-bold uppercase text-xs tracking-widest shadow-lg active:scale-[0.98] transition-all flex items-center justify-center"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "ส่งลิงก์รีเซ็ต"
              )}
            </button>
            <button
              type="button"
              onClick={() => setStep("LOGIN")}
              className="w-full text-[10px] font-bold text-brand-gray-500 hover:text-white transition-colors uppercase tracking-widest"
            >
              กลับหน้าล็อกอิน
            </button>
          </form>
        )}
      </div>

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 text-center space-y-2 opacity-50 hover:opacity-100 transition-opacity">
        <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-[0.2em]">
          GROWAPART SYSTEM
        </p>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/login")}
            className="text-[9px] font-bold text-brand-gray-500 hover:text-brand-orange-500 transition-colors uppercase"
          >
            OWNER PORTAL
          </button>
          <div className="w-1 h-1 bg-white/10 rounded-full"></div>
          <button className="text-[9px] font-bold text-brand-gray-500 hover:text-white transition-colors uppercase">
            SUPPORT
          </button>
        </div>
      </div>
    </div>
  );
}
