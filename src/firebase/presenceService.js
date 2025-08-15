// src/firebase/presenceService.js
import { ref, update, onDisconnect, serverTimestamp, onValue } from "firebase/database";
import { dbRealtime } from "./config";

// ====== İç durum (tekrar kurulumları engelle) ======
let _started = false;
let _unsubConnected = null;
let _heartbeatTimer = null;
let _unloadHandler = null;

/**
 * Panel veya Navbar açıkken avukatın çevrimiçi durumunu güvenceye alır.
 * - .info/connected true olduğunda onDisconnect kurar (sekme/bağlantı kapanırsa offline yazar)
 * - isOnline=true yazar ve 60 sn'de bir heartbeat gönderir
 * - Tekrarlı kurulumları otomatik engeller
 */
export const initLawyerPresence = (uid, email = "") => {
  if (!uid) return;
  if (_started) return;            // zaten kurulu
  _started = true;

  const lawyerRef = ref(dbRealtime, `lawyers/${uid}`);
  const connectedRef = ref(dbRealtime, ".info/connected");

  _unsubConnected = onValue(connectedRef, async (snap) => {
    const connected = snap.val() === true;
    if (!connected) return;

    try {
      // Bağlantı koparsa otomatik offline yaz
      await onDisconnect(lawyerRef).update({
        isOnline: false,
        lastSeen: serverTimestamp(),
      });

      // Şu an online
      await update(lawyerRef, {
        email: email,
        isOnline: true,
        lastSeen: serverTimestamp(),
        heartbeatAt: serverTimestamp(),
      });

      // Heartbeat (60 sn)
      if (!_heartbeatTimer) {
        _heartbeatTimer = setInterval(() => {
          update(lawyerRef, { heartbeatAt: serverTimestamp(), isOnline: true }).catch(() => {});
        }, 60_000);
      }
    } catch (e) {
      // sessizce geç
    }
  });

  // Sekme kapanmadan önce offline yaz (onDisconnect var ama bu da hızlı günceller)
  _unloadHandler = () => {
    update(lawyerRef, { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {});
  };
  window.addEventListener("beforeunload", _unloadHandler);
};

/**
 * Temizlik: Presence izlemesini durdur (genelde gerekmez; logout'ta offline yeterli)
 */
export const stopLawyerPresence = () => {
  if (_unsubConnected) {
    _unsubConnected();
    _unsubConnected = null;
  }
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  if (_unloadHandler) {
    window.removeEventListener("beforeunload", _unloadHandler);
    _unloadHandler = null;
  }
  _started = false;
};

/**
 * Geriye uyumluluk için: Eski kodun çağırıyorsa init'e yönlendir.
 * Navbar veya Panel'de bu fonksiyonu çağırman yeterli.
 */
export const setLawyerOnline = (uid, email) => {
  initLawyerPresence(uid, email);
};

export const setLawyerOffline = (uid) => {
  const lawyerRef = ref(dbRealtime, `lawyers/${uid}`);
  // Temizle ve offline yaz
  stopLawyerPresence();
  return update(lawyerRef, {
    isOnline: false,
    lastSeen: serverTimestamp(),
  });
};
