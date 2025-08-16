// src/types/blog.ts
export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl?: string;
  tags?: string[];
  publishedAt?: number; // timestamp
  publishedAtText?: string; // "16 Ağu 2025" gibi
  authorId?: string;
  status?: "draft" | "published";
};
