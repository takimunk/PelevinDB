// #/blog — the index; #/blog/:slug — one post.
import { Suspense, useEffect } from "react";
import { href } from "../../app/router.ts";
import { locale, useLang, useT, type Lang } from "../../i18n/index.ts";
import { findPost, POSTS, type Post } from "./posts.ts";
import "./blog.css";

const T = {
  en: {
    title: "Blog",
    min: "min read",
    missing: "There is no such post.",
    loading: "Loading the post",
  },
  ru: {
    title: "Блог",
    min: "мин чтения",
    missing: "Такого поста нет.",
    loading: "Загружаем пост",
  },
};

export const fmtDate = (iso: string, lang: Lang) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale(lang), { day: "numeric", month: "long", year: "numeric" });

export function BlogPage({ slug }: { slug?: string }) {
  const post = slug ? findPost(slug) : undefined;
  if (slug) return post ? <PostView post={post} /> : <Missing />;
  return <BlogIndex />;
}

function BlogIndex() {
  const t = useT(T);
  const lang = useLang();
  useEffect(() => {
    const previous = document.title;
    document.title = `${t.title} — PelevinDB`;
    return () => {
      document.title = previous;
    };
  }, [t]);
  return (
    <div className="blog">
      <header className="blog-masthead">
        <h1 className="blog-h1">{t.title}</h1>
      </header>
      <ol className="blog-list">
        {POSTS.map((p) => (
          <li key={p.slug} className="blog-item">
            <a href={href(`/blog/${p.slug}`)} className="blog-item-link">
              <p className="blog-meta">
                <time dateTime={p.date}>{fmtDate(p.date, lang)}</time>
                <span>
                  {p.minutes[lang]} {t.min}
                </span>
              </p>
              <h2 className="blog-item-title">{p.title[lang]}</h2>
              <p className="blog-item-dek">{p.dek[lang]}</p>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PostView({ post }: { post: Post }) {
  const t = useT(T);
  const lang = useLang();
  useEffect(() => {
    const previous = document.title;
    document.title = `${post.title[lang]} — PelevinDB`;
    return () => {
      document.title = previous;
    };
  }, [post, lang]);
  const { Component } = post;
  return (
    <article className="blog blog-post" lang={lang}>
      <nav className="blog-crumbs" aria-label={t.title}>
        <a href={href("/blog")}>← {t.title}</a>
      </nav>
      <header className="post-head">
        <p className="blog-meta">
          <time dateTime={post.date}>{fmtDate(post.date, lang)}</time>
          <span>
            {post.minutes[lang]} {t.min}
          </span>
        </p>
        <h1 className="post-title">{post.title[lang]}</h1>
        <p className="post-dek">{post.dek[lang]}</p>
      </header>
      <Suspense
        fallback={
          <p className="blog-loading" role="status">
            {t.loading}…
          </p>
        }
      >
        <Component />
      </Suspense>
      <footer className="post-foot">
        <a href={href("/blog")}>← {t.title}</a>
      </footer>
    </article>
  );
}

function Missing() {
  const t = useT(T);
  return (
    <div className="blog">
      <p className="blog-lede">{t.missing}</p>
      <p className="blog-foot">
        <a href={href("/blog")}>← {t.title}</a>
      </p>
    </div>
  );
}
