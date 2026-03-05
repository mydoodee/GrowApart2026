import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyARRt1tf1OT8Q7l9FoOrHiv-oPhLCueg6Y",
    authDomain: "growapart.firebaseapp.com",
    projectId: "growapart",
    storageBucket: "growapart.firebasestorage.app",
    messagingSenderId: "565419740995",
    appId: "1:565419740995:web:4d844dbf5ad09e2d0729f6",
    measurementId: "G-BGQ571MXV6"
};

const firebaseConfig2 = {
    apiKey: "AIzaSyCTtjWLVDRnVfF4DCh3qj8GtUrLQnLC218",
    authDomain: "appq-q789.firebaseapp.com",
    projectId: "appq-q789",
    storageBucket: "appq-q789.firebasestorage.app",
    messagingSenderId: "84305501022",
    appId: "1:84305501022:web:5b1b9c3b6b6f551001cdcf",
    measurementId: "G-5Q0NGYNKRP"
};

const app = initializeApp(firebaseConfig);
const app2 = initializeApp(firebaseConfig2, "app2");

export let analytics = null;
isSupported().then(supported => {
    if (supported) {
        analytics = getAnalytics(app);
    }
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const auth2 = getAuth(app2);
export const db2 = getFirestore(app2);
export const storage2 = getStorage(app2);
