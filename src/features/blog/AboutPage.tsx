// #/about — a short personal note, copyright, contributing and the project's two links.
import { useEffect } from "react";
import { useT } from "../../i18n/index.ts";
import { AUTHOR_URL, GitHubMark, REPO_URL, XMark } from "../../ui/Social.tsx";
import "./blog.css";

const T = {
  en: {
    doc: "About",
    body: [
      "I like thinking about the master’s books, and I always missed a single interface to the whole corpus. With this project I tried to provide one. New features will come. Probably.",
    ],
    copyrightTitle: "Copyright",
    copyright:
      "The books belong to their author and publishers. PelevinDB does not publish full texts: only statistics derived from them, short quotes, and the text of a single page at a time while you read it. If you enjoy what you find here, buy the books.",
    contributeTitle: "Contributing",
    contribute: "The code is open. Ideas, bug reports and pull requests are welcome on GitHub.",
    links: "Links",
    repo: "GitHub",
    author: "central dogma specialist",
  },
  ru: {
    doc: "О проекте",
    body: [
      "Мне нравится размышлять над книгами мастера, и всегда не хватало какого-то общего интерфейса ко всему корпусу. В этом проекте я попытался его предоставить. Новые фичи будут. Возможно.",
    ],
    copyrightTitle: "Авторские права",
    copyright:
      "Книги принадлежат автору и издателям. PelevinDB не публикует полные тексты: только статистику, посчитанную по ним, короткие цитаты и текст одной страницы за раз — пока вы её читаете. Если вам понравилось то, что вы здесь нашли, купите книги.",
    contributeTitle: "Участие",
    contribute: "Код открыт. Идеи, сообщения об ошибках и пулл-реквесты — на GitHub.",
    links: "Ссылки",
    repo: "GitHub",
    author: "central dogma specialist",
  },
};

export function AboutPage() {
  const t = useT(T);
  useEffect(() => {
    const previous = document.title;
    document.title = `${t.doc} — PelevinDB`;
    return () => {
      document.title = previous;
    };
  }, [t]);
  return (
    <article className="blog about">
      <header className="about-head">
        <h1 className="about-title">П</h1>
      </header>
      <div className="blog-prose">
        {t.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <h2>{t.copyrightTitle}</h2>
        <p>{t.copyright}</p>
        <h2>{t.contributeTitle}</h2>
        <p>
          {t.contribute.split("GitHub")[0]}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          {t.contribute.split("GitHub")[1]}
        </p>
      </div>
      <nav className="about-links" aria-label={t.links}>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          <GitHubMark /> {t.repo}
        </a>
        <a href={AUTHOR_URL} target="_blank" rel="noreferrer">
          <XMark /> {t.author}
        </a>
      </nav>
    </article>
  );
}
