// src/types/blog.ts
export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  tags?: string[];
  coverUrl?: string;
  status: "draft" | "published";
  authorId: string;
  authorName?: string;
  createdAt: number;   // Date.now()
  updatedAt: number;
  publishedAt?: number;
  // BlogCard/Section ile uyum için:
  publishedAtText?: string;
};
