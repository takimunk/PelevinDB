// "From image to idea": what Jev's answers say about how Pelevin changed. Loads /blog/jev.json.
import { useState } from "react";
import { useLang } from "../../../i18n/index.ts";
import { ContentEn } from "./content.en.tsx";
import { ContentRu } from "./content.ru.tsx";
import { useJev } from "./data.ts";
import { facts } from "./facts.ts";
import "./jev.css";

export default function JevPost() {
  const lang = useLang();
  const { data, error } = useJev();
  // Fig. 1 and Fig. 2 share their dimensions: a row picked in Fig. 1 is drawn in Fig. 2.
  const [a, setA] = useState("texture:imagery");
  const [b, setB] = useState<string | null>("texture:ideas");
  const pick = (k: string) => {
    if (k === a || k === b) return;
    setB(a);
    setA(k);
    document
      .getElementById("jv-fig-2")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  if (error)
    return (
      <p className="blog-error" role="alert">
        {lang === "ru"
          ? "Не удалось загрузить данные для этой статьи. Попробуйте обновить страницу."
          : "The data behind this post could not be loaded. Try reloading the page."}
      </p>
    );
  if (!data)
    return (
      <p className="blog-loading" role="status">
        {lang === "ru" ? "Загружаем данные…" : "Loading the data…"}
      </p>
    );
  const f = facts(data);
  const Content = lang === "ru" ? ContentRu : ContentEn;
  return <Content jev={data} f={f} s={{ a, b, setA, setB, pick }} />;
}
