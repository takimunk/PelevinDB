// #/blog — the index; #/blog/:slug — one post.
import { Suspense, useEffect } from "react";
import { href } from "../../app/router.ts";
import { locale, useLang, useT, type Lang } from "../../i18n/index.ts";
import { findPost, POSTS, type Post } from "./posts.ts";
import "./blog.css";

const T = {
  en: {
    kicker: "Journal",
    title: "Notes from the reading room",
    lede: "Essays and working notes on reading Viktor Pelevin with a machine: what we measure, how, and what the numbers do and do not say.",
    read: "Read",
    min: "min read",
    all: "All notes",
    missing: "There is no such note.",
    loading: "Loading the note",
    about: "About PelevinDB",
  },
  ru: {
    kicker: "Журнал",
    title: "Записки из читального зала",
    lede: "Эссе и рабочие заметки о том, как мы читаем Виктора Пелевина вместе с машиной: что измеряем, как и о чём цифры говорят, а о чём молчат.",
    read: "Читать",
    min: "мин чтения",
    all: "Все заметки",
    missing: "Такой заметки нет.",
    loading: "Загружаем заметку",
    about: "О проекте",
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
    document.title = `${t.kicker} — PelevinDB`;
    return () => {
      document.title = previous;
    };
  }, [t]);
  return (
    <div className="blog">
      <header className="blog-masthead">
        <p className="blog-kicker">{t.kicker}</p>
        <h1 className="blog-h1">{t.title}</h1>
        <p className="blog-lede">{t.lede}</p>
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
              <p className="blog-tags">{p.tags[lang].join(" / ")}</p>
              <span className="blog-more">{t.read} →</span>
            </a>
          </li>
        ))}
      </ol>
      <p className="blog-foot">
        <a href={href("/about")}>{t.about} →</a>
      </p>
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
      <nav className="blog-crumbs" aria-label={t.kicker}>
        <a href={href("/blog")}>← {t.all}</a>
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
        <a href={href("/blog")}>← {t.all}</a>
        <a href={href("/about")}>{t.about} →</a>
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
        <a href={href("/blog")}>← {t.all}</a>
      </p>
    </div>
  );
}
