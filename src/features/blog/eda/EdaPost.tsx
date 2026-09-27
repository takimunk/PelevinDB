// The EDA post: loads /blog/eda.json and renders the essay in the reader's language.
import { useLang } from "../../../i18n/index.ts";
import { ContentEn } from "./content.en.tsx";
import { ContentRu } from "./content.ru.tsx";
import { loadEda, useLoad } from "./data.ts";
import { facts } from "./facts.ts";

export default function EdaPost() {
  const lang = useLang();
  const eda = useLoad(loadEda);
  if (eda.state === "loading")
    return (
      <p className="blog-loading" role="status">
        {lang === "ru" ? "Загружаем данные…" : "Loading the data…"}
      </p>
    );
  if (eda.state === "error")
    return (
      <p className="blog-error" role="alert">
        {lang === "ru" ? "Не удалось загрузить данные для этой статьи. Попробуйте обновить страницу." : "The data behind this post could not be loaded. Try reloading the page."}
      </p>
    );
  const f = facts(eda.data);
  const Content = lang === "ru" ? ContentRu : ContentEn;
  return (
    <>
      {eda.mock && (
        <p className="eda-mock" role="note">
          DEV · mock data (public/blog/eda.json not found) — numbers are synthetic
        </p>
      )}
      <Content eda={eda.data} f={f} />
    </>
  );
}
