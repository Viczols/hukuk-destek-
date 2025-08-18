// src/components/HomepageBlog.tsx
"use client";
import { useEffect, useState } from "react";
import { BlogPost } from "../types/blog";
import BlogSection from "../components/BlogSection";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "firebase/firestore";

export default function HomepageBlog() {
  const db = getFirestore();
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    (async () => {
      const qRef = query(
        collection(db, "posts"),
        where("status", "==", "published"),
        orderBy("publishedAt", "desc"),
        limit(12)
      );
      const snap = await getDocs(qRef);
      const list: BlogPost[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const publishedAtText = data.publishedAt
          ? new Intl.RelativeTimeFormat("tr", { numeric: "auto" }).format(
              Math.round((data.publishedAt - Date.now()) / (1000 * 60 * 60 * 24)),
              "day"
            )
          : "";
        return { id: d.id, ...data, publishedAtText };
      });
      setPosts(list);
    })();
  }, [db]);

  return <BlogSection posts={posts} title="Blog" initialLimit={6} />;
}
