import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  User as UserIcon,
} from "lucide-react";

const GoogleIcon = () => (
  <svg className="w-5 h-5 mr-3" viewBox="0 0 48 48">
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

export default function Login({ user }) {
  const navigate = useNavigate();

  const [step, setStep] = useState("LOGIN"); // 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    async function checkUserProfile() {
      if (user && step === "LOGIN") {
        const ctx = localStorage.getItem("loginContext");
        if (ctx === "provider") {
          navigate("/dashboard", { replace: true });
        }
      }
    }
    checkUserProfile();
  }, [user, navigate, step]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password)
      return setError("กรุณากรอกอีเมล/เบอร์โทรและรหัสผ่าน");
    setError("");
    setLoading(true);
    try {
      // Check if input is a phone number (e.g. 10 digits)
      const isPhone = /^\d{9,10}$/.test(email.replace(/\D/g, ""));
      const loginEmail = isPhone
        ? `${email.replace(/\D/g, "")}@growapart.system`
        : email;

      await signInWithEmailAndPassword(auth, loginEmail, password);
      localStorage.removeItem("activeApartmentId");
      localStorage.removeItem("selectedBuildingIds");
      localStorage.setItem("loginContext", "provider");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error(err);
      if (err.code === "auth/invalid-credential") {
        setError(
          "อีเมล/เบอร์โทร หรือรหัสผ่านไม่ถูกต้อง (หรือยังไม่ได้สมัครสมาชิก)",
        );
      } else if (err.code === "auth/operation-not-allowed") {
        setError(
          "กรุณาเปิดการใช้งาน Email/Password Provider ใน Firebase Console",
        );
      } else {
        setError("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
      }
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name || !email || !password)
      return setError("กรุณากรอกข้อมูลให้ครบถ้วน");
    if (password.length < 6)
      return setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    setError("");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      await setDoc(doc(db, "users", userCredential.user.uid), {
        name,
        email,
        role: "owner",
        createdAt: serverTimestamp(),
      });
      localStorage.removeItem("activeApartmentId");
      localStorage.removeItem("selectedBuildingIds");
      localStorage.setItem("loginContext", "provider");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("อีเมลนี้ถูกลงทะเบียนไว้แล้ว กรุณาเข้าสู่ระบบ");
      } else if (err.code === "auth/invalid-email") {
        setError("รูปแบบอีเมลไม่ถูกต้อง");
      } else {
        setError("เกิดข้อผิดพลาดในการสมัครสมาชิก");
      }
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const docRef = doc(db, "users", result.user.uid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, {
          name: result.user.displayName || "ผู้ใช้ Google",
          email: result.user.email,
          role: "owner",
          createdAt: serverTimestamp(),
        });
      }
      localStorage.removeItem("activeApartmentId");
      localStorage.removeItem("selectedBuildingIds");
      localStorage.setItem("loginContext", "provider");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error(err);
      setError("การเข้าสู่ระบบด้วย Google ล้มเหลว");
    }
    setLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!email) return setError("กรุณากรอกอีเมลที่ใช้ลงทะเบียน");
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setError(
        "เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว (หากไม่พบ กรุณาเช็คใน Spam)",
      );
    } catch (err) {
      console.error(err);
      if (err.code === "auth/user-not-found") {
        setError("ไม่พบบัญชีผู้ใช้นี้ในระบบ");
      } else if (err.code === "auth/invalid-email") {
        setError("รูปแบบอีเมลไม่ถูกต้อง");
      } else {
        setError("เกิดข้อผิดพลาดในการส่งอีเมลรีเซ็ตรหัสผ่าน");
      }
    }
    setLoading(false);
  };

  const getHeaderTitle = () => {
    if (step === "LOGIN") return "เข้าสู่ระบบ";
    if (step === "REGISTER") return "สมัครสมาชิก";
    return "ลืมรหัสผ่าน";
  };

  const getHeaderSubtitle = () => {
    if (step === "LOGIN") return "ระบบจัดการสำหรับเจ้าของหอพักและพนักงาน";
    if (step === "REGISTER") return "สร้างบัญชีเพื่อเริ่มต้นใช้งานระบบ";
    return "ระบุอีเมลเพื่อรับลิงก์รีเซ็ตรหัสผ่าน";
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle SVG Grid Pattern */}
      <div
        className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23F39C12' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      ></div>

      {/* Mesh Gradient Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-orange-500/10 rounded-full blur-[120px] animate-pulse pointer-events-none"></div>
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-orange-500/10 rounded-full blur-[120px] animate-pulse pointer-events-none"
        style={{ animationDelay: "2s" }}
      ></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-brand-bg/50 rounded-full blur-[150px] pointer-events-none"></div>

      <div className="w-full max-w-[360px] bg-brand-card/80 backdrop-blur-xl border border-white/10 rounded-xl px-7 py-9 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] relative z-10 transition-all">
        <div className="flex justify-center mb-5">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-orange-500 to-brand-orange-400 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex items-center space-x-1 text-5xl font-bold tracking-tighter bg-brand-card px-4 py-2 rounded-xl border border-white/10">
              <span className="text-white">L</span>
              <span className="text-brand-orange-500">K</span>
            </div>
          </div>
        </div>

        <div className="text-center mb-5">
          <h1 className="text-xl font-bold text-white mb-1 tracking-tight">
            {getHeaderTitle()}
          </h1>
          <p className="text-brand-gray-400 text-sm font-medium opacity-80">
            {getHeaderSubtitle()}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-500 text-xs p-3 rounded-xl mb-6 text-center">
            {error}
          </div>
        )}

        {step === "LOGIN" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">
                อีเมล / เบอร์โทรศัพท์
              </label>
              <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                <UserIcon className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder="admin@domain.com หรือ 08X-XXX-XXXX"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 text-sm"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <label className="block text-brand-orange-500 text-[11px] font-bold uppercase tracking-wider">
                  รหัสผ่าน
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep("FORGOT_PASSWORD");
                    setError("");
                  }}
                  className="text-xs text-brand-gray-400 hover:text-white transition-colors"
                >
                  ลืมรหัสผ่าน?
                </button>
              </div>
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
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#e67e22] via-[#f39c12] to-[#f1c40f] hover:from-[#f39c12] hover:via-[#f1c40f] hover:to-[#fbc531] text-brand-bg font-extrabold py-2.5 rounded-xl mt-4 shadow-[0_4px_15px_-3px_rgba(243,156,18,0.4)] transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center border-b-2 border-orange-700/30"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "เข้าสู่ระบบ"
              )}
            </button>

            <div className="flex items-center my-6">
              <div className="flex-1 border-b border-gray-800"></div>
              <span className="px-4 text-xs text-gray-500 font-medium">
                หรือดำเนินการต่อด้วย
              </span>
              <div className="flex-1 border-b border-gray-800"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-white hover:bg-gray-50 text-gray-900 font-extrabold py-2 rounded-xl shadow-lg flex items-center justify-center transition-all disabled:opacity-70 border border-gray-100"
            >
              <GoogleIcon />
              Google
            </button>

            <div className="text-center mt-10 space-y-3">
              <p className="text-xs text-gray-500 font-medium tracking-tight">
                ยังไม่มีบัญชี?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setStep("REGISTER");
                    setError("");
                    setEmail("");
                    setPassword("");
                  }}
                  className="text-brand-orange-500 font-bold hover:underline"
                >
                  สมัครเลย
                </button>
              </p>
              <div className="pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => navigate("/tenant-login")}
                  className="text-[10px] font-bold text-brand-gray-500 hover:text-white transition-colors uppercase tracking-widest"
                >
                  เข้าสู่ระบบสำหรับผู้เช่า
                </button>
              </div>
            </div>
          </form>
        )}

        {step === "FORGOT_PASSWORD" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="text-left mb-6">
              <p className="text-xs text-brand-gray-400 leading-relaxed font-medium">
                ระบุอีเมลของคุณเพื่อรับลิงก์สำหรับตั้งรหัสผ่านใหม่
              </p>
            </div>
            <div>
              <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">
                อีเมล
              </label>
              <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                <Mail className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                <input
                  type="email"
                  placeholder="admin1@growkub.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#e67e22] via-[#f39c12] to-[#f1c40f] hover:from-[#f39c12] hover:via-[#f1c40f] hover:to-[#fbc531] text-brand-bg font-extrabold py-2.5 rounded-xl mt-4 shadow-[0_4px_15px_-3px_rgba(243,156,18,0.4)] transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center border-b-2 border-orange-700/30"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "ส่งลิงก์รีเซ็ตรหัสผ่าน"
              )}
            </button>
            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => {
                  setStep("LOGIN");
                  setError("");
                }}
                className="text-gray-500 text-xs font-medium hover:text-white transition-colors"
              >
                กลับไปหน้า{" "}
                <span className="text-brand-orange-500 font-bold">
                  เข้าสู่ระบบ
                </span>
              </button>
            </div>
          </form>
        )}

        {step === "REGISTER" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">
                ชื่อ - นามสกุล
              </label>
              <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                <UserIcon className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder="สมชาย ใจดี"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">
                อีเมล
              </label>
              <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                <Mail className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                <input
                  type="email"
                  placeholder="your-email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-brand-orange-500 text-[11px] font-bold mb-1.5 ml-1 uppercase tracking-wider">
                ตั้งรหัสผ่าน
              </label>
              <div className="flex items-center bg-brand-input-bg rounded-xl px-4 py-2 border border-transparent focus-within:border-brand-orange-500/50 transition-all shadow-inner">
                <Lock className="w-4.5 h-4.5 text-brand-bg/40 mr-3 shrink-0" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-transparent border-none text-brand-input-text font-semibold w-full outline-none placeholder-brand-bg/30 tracking-widest text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-brand-bg/30 hover:text-brand-bg/50 focus:outline-none ml-2"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#e67e22] via-[#f39c12] to-[#f1c40f] hover:from-[#f39c12] hover:via-[#f1c40f] hover:to-[#fbc531] text-brand-bg font-extrabold py-2.5 rounded-xl shadow-[0_4px_15px_-3px_rgba(243,156,18,0.4)] transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center mt-4 border-b-2 border-orange-700/30"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "ยืนยันการสมัครสมาชิก"
              )}
            </button>
            <div className="text-center mt-10">
              <button
                type="button"
                onClick={() => {
                  setStep("LOGIN");
                  setError("");
                  setEmail("");
                  setPassword("");
                }}
                className="text-gray-500 text-xs font-medium hover:text-white transition-colors"
              >
                มีบัญชีอยู่แล้ว?{" "}
                <span className="text-brand-orange-500 font-bold">
                  เข้าสู่ระบบ
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
