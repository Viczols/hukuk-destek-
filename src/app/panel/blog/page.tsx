"use client";

import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { BlogPost } from "../../../types/blog";

import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  onSnapshot,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { getStorage, ref, deleteObject } from "firebase/storage";

/* ===================== Firebase tekil referanslar ===================== */
const db = getFirestore();
const storage = getStorage();
const auth = getAuth();

/* =========================== Config =========================== */
const BLOG_UPLOAD_URL =
  process.env.NEXT_PUBLIC_BLOG_UPLOAD_URL ||
  "https://europe-west1-dilekce-destek.cloudfunctions.net/blogUpload";

  
const BLOG_DELETE_URL =
  process.env.NEXT_PUBLIC_BLOG_DELETE_URL ||
  "https://europe-west1-dilekce-destek.cloudfunctions.net/blogDelete";

/* =============================== Helpers ============================== */
function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
const toMs = (v: any, fallback = 0) =>
  typeof v === "number" ? v : v?.toMillis?.() ?? fallback;

/* ================================ Page ================================ */
export default function BlogPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState<string | undefined>();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | undefined>();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BlogPost[]>([]);
  const [editing, setEditing] = useState<BlogPost | null>(null);

  /* --------------------------- Auth listener -------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUserId(u.uid);
        setAuthorName(u.displayName || u.email || "Uzman");
      } else {
        setUserId(null);
      }
    });
    return () => unsub();
  }, []);

  /* ---------------------- Edit → form auto-fill ----------------------- */
  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title || "");
    setContent(editing.content || "");
    setTagsText((editing.tags || []).join(", "));
    setCoverPreview(editing.coverUrl || undefined);
    setCoverFile(null);
  }, [editing]);

  /* ------------------------------ Excerpt ----------------------------- */
  const excerpt = useMemo(() => {
    const plain = content.replace(/\s+/g, " ").trim();
    return plain.slice(0, 180) + (plain.length > 180 ? "…" : "");
  }, [content]);

  /* --------------------------- Slug uniq check ------------------------ */
  async function ensureUniqueSlug(base: string) {
    let s = slugify(base) || "yazi";
    let i = 0;
    while (true) {
      const qRef = query(collection(db, "posts"), where("slug", "==", s));
      const snap = await getDocs(qRef);
      if (snap.empty) return s;
      i += 1;
      s = `${slugify(base)}-${i}`;
    }
  }

  /* --------------------- Realtime list (no refresh) ------------------- */
  useEffect(() => {
    if (!userId) return;
    const qRef = query(collection(db, "posts"), where("authorId", "==", userId));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
          const data = d.data() as any;
          const createdAt = toMs(data.createdAt, Date.now());
          const updatedAt = toMs(data.updatedAt, Date.now());
          const publishedAt = toMs(data.publishedAt, 0);
          return {
            id: d.id,
            ...data,
            createdAt,
            updatedAt,
            publishedAt,
            publishedAtText: publishedAt
              ? new Intl.RelativeTimeFormat("tr", { numeric: "auto" }).format(
                  Math.round((publishedAt - Date.now()) / 86400000),
                  "day"
                )
              : "taslak",
          } as BlogPost;
        });
        list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setRows(list);
      },
      (err) => console.error("onSnapshot(posts) error:", err)
    );
    return () => unsub();
  }, [userId]);

  function resetForm() {
    setTitle("");
    setContent("");
    setTagsText("");
    setCoverFile(null);
    setCoverPreview(undefined);
    setEditing(null);
  }

  /* --------- Kapak upload: DOĞRUDAN Functions (CORS) --------- */
  const uploadCoverIfSelected = async (postId: string) => {
    if (!coverFile) return null;

    const user = auth.currentUser;
    const idToken = user ? await user.getIdToken() : null;
    if (!idToken) throw new Error("no-auth");

    const fd = new FormData();
    fd.append("postId", postId);
    fd.append("file", coverFile, coverFile.name);

    const res = await fetch(BLOG_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` }, // Content-Type YOK!
      body: fd,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[BLOG] cover upload via API failed:", res.status, text);
      throw new Error(text || `upload failed: ${res.status}`);
    }

    const json = await res.json();
    return (json?.url as string) || null;
  };

  /* --------------------- Upsert (create or update) -------------------- */
  async function upsertPostAndReturnId(): Promise<string> {
    if (!userId) throw new Error("no-user");
    const now = Date.now();

    const base: Partial<BlogPost> = {
      title,
      content,
      excerpt,
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      authorId: userId,
      authorName,
      updatedAt: now,
    };

    let postId: string;
    if (editing) {
      postId = editing.id;
      await updateDoc(doc(db, "posts", postId), {
        ...base,
        slug: editing.slug,
        createdAt: editing.createdAt ?? now,
        status: editing.status ?? "draft",
      });
      console.log("[BLOG] updated post:", postId);
    } else {
      const slug = await ensureUniqueSlug(title);
      const docRef = await addDoc(collection(db, "posts"), {
        ...base,
        slug,
        createdAt: now,
        status: "draft",
      });
      postId = docRef.id;
      console.log("[BLOG] created post:", postId);
    }

    try {
      await uploadCoverIfSelected(postId); // Firestore güncellemesini Function yapıyor
    } catch (e) {
      // Upload hatası post'u bloklamasın (log zaten atıldı)
    }

    return postId;
  }

  /* ------------------------------- Actions ---------------------------- */
  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!userId) return;
    setLoading(true);
    try {
      await upsertPostAndReturnId();
      resetForm();
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAndPublish() {
    if (!userId) return;
    setLoading(true);
    try {
      const postId = await upsertPostAndReturnId();
      const now = Date.now();
      await updateDoc(doc(db, "posts", postId), {
        status: "published",
        publishedAt: now,
        updatedAt: now,
      });
      console.log("[BLOG] published:", postId);
      resetForm();
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(p: BlogPost) {
    const now = Date.now();
    await updateDoc(doc(db, "posts", p.id), {
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
  }

  async function handleUnpublish(p: BlogPost) {
    await updateDoc(doc(db, "posts", p.id), {
      status: "draft",
      updatedAt: Date.now(),
    });
  }

async function handleDelete(p: BlogPost) {
  if (!confirm("Bu yazıyı silmek istediğinizden emin misiniz?")) return;
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken() : null;
  if (!idToken) { alert("Oturum yok"); return; }

  const res = await fetch(BLOG_DELETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ postId: p.id }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("[BLOG] delete failed:", res.status, t);
    alert("Silme başarısız: " + (t || res.status));
    return;
  }

  // Realtime onSnapshot zaten listeyi güncelliyor; ekstra iş yok.
}

  /* -------------------------------- UI -------------------------------- */
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold text-white">Blog Yönetimi</h1>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {editing ? "Yazıyı Düzenle" : "Yeni Yazı Oluştur"}
          </h2>

          {editing && (
            <div className="flex items-center gap-2">
              <span
                className={`text-xs rounded-full px-2 py-1 border ${
                  editing.status === "published"
                    ? "border-emerald-600/50 bg-emerald-600/10 text-emerald-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300"
                }`}
              >
                {editing.status === "published" ? "Yayınlandı" : "Taslak"}
              </span>

              {editing.status !== "published" && (
                <button
                  type="button"
                  onClick={handleSaveAndPublish}
                  disabled={loading}
                  className="rounded-full px-3 py-1.5 bg-white text-zinc-900 hover:bg-zinc-200 transition disabled:opacity-60"
                  title="Kaydet ve hemen yayınla"
                >
                  Kaydet & Yayınla
                </button>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-5">
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <label className="block text-sm text-zinc-300">Başlık</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Başlık"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder-zinc-400 px-3 py-2"
                required
              />

              <label className="block text-sm text-zinc-300">Etiketler</label>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="etiket1, etiket2"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder-zinc-400 px-3 py-2"
              />

              <label className="block text-sm text-zinc-300">İçerik</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="İçerik..."
                rows={12}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder-zinc-400 px-3 py-2 leading-6"
                required
              />
            </div>

            <div className="space-y-4">
              <label className="block text-sm text-zinc-300">Kapak Görseli</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setCoverFile(f);
                  setCoverPreview(f ? URL.createObjectURL(f) : editing?.coverUrl || undefined);
                }}
                className="w-full text-sm text-zinc-2 00 file:mr-3 file:rounded-lg file:border file:border-zinc-700 file:bg-zinc-950 file:px-3 file:py-2 file:text-zinc-100 hover:file:bg-zinc-900"
              />

              {coverPreview && (
                <img
                  src={coverPreview}
                  alt="Kapak önizleme"
                  className="w-full aspect-video object-cover rounded-xl border border-zinc-700"
                />
              )}

              <div className="text-xs text-zinc-400">
                Özet (otomatik): <span className="text-zinc-300">{excerpt || "—"}</span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full px-4 py-2 bg-zinc-800 text-white hover:bg-zinc-700 transition disabled:opacity-60"
                >
                  {editing ? "Kaydet" : "Taslak Oluştur"}
                </button>

                {editing && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full px-4 py-2 bg-zinc-800 text-white hover:bg-zinc-700 transition"
                  >
                    İptal
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Yazılarım */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Yazılarım</h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {rows.map((p) => (
            <div
              key={p.id}
              className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 transition"
            >
              <div className="relative aspect-[16/9]">
                {p.coverUrl ? (
                  <img
                    src={p.coverUrl}
                    alt={p.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-zinc-500 bg-zinc-900">
                    Kapak Görseli
                  </div>
                )}
              </div>

              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs rounded-full px-2 py-1 border ${
                      p.status === "published"
                        ? "border-emerald-600/50 bg-emerald-600/10 text-emerald-300"
                        : "border-zinc-700 bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {p.status === "published" ? "Yayınlandı" : "Taslak"}
                  </span>
                  <div className="text-[11px] text-zinc-400 truncate max-w-[55%]">
                    {p.slug}
                  </div>
                </div>

                <div className="font-medium text-zinc-100 line-clamp-2">{p.title}</div>
                <div className="text-sm text-zinc-300 line-clamp-2">{p.excerpt}</div>

                {p.tags?.length ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {p.tags.map((t: string) => (
                      <span
                        key={t}
                        className="text-[11px] rounded-full px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => setEditing(p)}
                    className="text-sm rounded-full px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                  >
                    Düzenle
                  </button>

                  {p.status === "published" ? (
                    <button
                      onClick={() => handleUnpublish(p)}
                      className="text-sm rounded-full px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                    >
                      Yayından Al
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePublish(p)}
                      className="text-sm rounded-full px-3 py-1.5 bg-white text-zinc-900 hover:bg-zinc-200"
                    >
                      Yayınla
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(p)}
                    className="text-sm rounded-full px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white"
                  >
                    Sil
                  </button>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="col-span-full text-zinc-400">Henüz yazınız yok.</div>
          )}
        </div>
      </div>
    </div>
  );
}
