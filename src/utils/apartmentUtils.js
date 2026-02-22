import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Fetches apartments where the user is either the owner or explicitly listed as a manager.
 * @param {object} db - Firestore instance
 * @param {object} user - Current logged-in Firebase auth user
 * @returns {Promise<Array>} List of apartments the user has access to
 */
export const getUserApartments = async (db, user) => {
    if (!user) return [];

    const appsMap = new Map();

    try {
        // 1. Fetch apartments owned by the user
        const q1 = query(collection(db, 'apartments'), where('ownerId', '==', user.uid));
        const snap1 = await getDocs(q1);
        snap1.forEach(doc => appsMap.set(doc.id, { id: doc.id, ...doc.data() }));

        // 2. Fetch apartments where user email is in the managers array
        if (user.email) {
            const q2 = query(collection(db, 'apartments'), where('managers', 'array-contains', user.email));
            const snap2 = await getDocs(q2);
            snap2.forEach(doc => {
                if (!appsMap.has(doc.id)) {
                    appsMap.set(doc.id, { id: doc.id, ...doc.data() });
                }
            });
        }
    } catch (error) {
        console.error("Error fetching user apartments: ", error);
    }

    // Sort by createdAt or name if needed, here we just return the array
    return Array.from(appsMap.values());
};
