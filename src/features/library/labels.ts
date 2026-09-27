// Russian names for catalog dimensions and corpus metadata, plus title helpers shared by home, library and search.
// shared/catalog.ts carries `ru` on most items; this table fills the gaps (and older catalogs), read through `dimLabel`.
import type { BookKind, CorpusEntry } from "../../../shared/types.ts";
import type { Lang } from "../../i18n/index.ts";

const RU: Record<string, string> = {
  // emotions
  "emotion:joy": "Радость",
  "emotion:trust": "Доверие",
  "emotion:fear": "Страх",
  "emotion:surprise": "Удивление",
  "emotion:sadness": "Грусть",
  "emotion:disgust": "Отвращение",
  "emotion:anger": "Гнев",
  "emotion:anticipation": "Предвкушение",
  // texture
  "texture:pace": "Темп",
  "texture:tension": "Напряжение",
  "texture:interiority": "Внутренний мир",
  "texture:imagery": "Образность",
  "texture:ideas": "Идеи",
  "texture:humor": "Юмор",
  "texture:valence": "Свет",
  // mood
  "mood:meditative": "Созерцательное",
  "mood:idyllic": "Идиллическое",
  "mood:melancholic": "Меланхоличное",
  "mood:tender": "Нежное",
  "mood:playful": "Игривое",
  "mood:mysterious": "Загадочное",
  "mood:suspenseful": "Тревожное",
  "mood:kinetic": "Стремительное",
  "mood:grim": "Мрачное",
  "mood:solemn": "Торжественное",
  "mood:everyday": "Будничное",
  // narration
  "mode:action": "Действие",
  "mode:dialogue": "Диалог",
  "mode:description": "Описание",
  "mode:introspection": "Самоанализ",
  "mode:exposition": "Экспозиция",
  "mode:essay": "Отступление",
  "mode:document": "Документ",
  "mode:verse": "Стихи",
  "mode:paratext": "Паратекст",
  // themes
  "theme:love": "Любовь",
  "theme:family": "Семья",
  "theme:friendship": "Дружба",
  "theme:death": "Смерть",
  "theme:war": "Война",
  "theme:power": "Власть",
  "theme:money": "Деньги",
  "theme:crime": "Преступление",
  "theme:faith": "Вера",
  "theme:nature": "Природа",
  "theme:journey": "Путешествие",
  "theme:home": "Дом",
  "theme:memory": "Память",
  "theme:loneliness": "Одиночество",
  "theme:identity": "Личность",
  "theme:freedom": "Свобода",
  "theme:art": "Искусство",
  "theme:science": "Наука",
  "theme:supernatural": "Сверхъестественное",
  // genres
  "genre:literary": "Литературная проза",
  "genre:romance": "Любовный роман",
  "genre:detective": "Детектив",
  "genre:adventure": "Приключения",
  "genre:fantasy": "Фэнтези",
  "genre:scifi": "Фантастика",
  "genre:horror": "Готика и хоррор",
  "genre:historical": "Исторический роман",
  "genre:satire": "Сатира",
  "genre:children": "Детская литература",
  "genre:philosophical": "Роман идей",
  "genre:nonfiction": "Нон-фикшн",
  // eras
  "era:antiquity": "Античность",
  "era:medieval": "Средние века",
  "era:earlymodern": "1500–1800",
  "era:nineteenth": "XIX век",
  "era:earlytwentieth": "1900–1945",
  "era:modern": "Современность",
  "era:future": "Будущее",
  "era:invented": "Вымышленный мир",
  "era:unclear": "Неясно",
  // whole-book scales
  "scale:realism": "Фантастичность",
  "scale:scope": "Масштаб",
  "scale:worldview": "Надежда",
  "scale:drive": "Сюжетность",
  "scale:complexity": "Сложность",
  "scale:audience": "Взрослость",
  // Vonnegut's story shapes
  "arc:rise": "Из грязи в князи",
  "arc:fall": "Трагедия",
  "arc:hole": "Человек в яме",
  "arc:icarus": "Икар",
  "arc:cinderella": "Золушка",
  "arc:oedipus": "Эдип",
  "arc:flat": "Ровная линия",
  // acts of a book
  "act:opening": "начало",
  "act:setup": "завязка",
  "act:middle": "середина",
  "act:escalation": "нарастание",
  "act:ending": "финал",
};

export type DimGroup = "emotion" | "texture" | "mood" | "mode" | "theme" | "genre" | "era" | "scale" | "arc" | "act";

type Labelled = { id: string; label: string; ru?: string };

/** A catalog label in the current language: the catalog's own `ru` first, then this table, then the English label. */
export const dimLabel = (group: DimGroup, item: Labelled, lang: Lang) => (lang === "ru" ? (item.ru ?? RU[`${group}:${item.id}`] ?? item.label) : item.label);

const KINDS: Record<BookKind, { en: [string, string]; ru: [string, string, string] }> = {
  novel: { en: ["novel", "novels"], ru: ["роман", "романа", "романов"] },
  novella: { en: ["novella", "novellas"], ru: ["повесть", "повести", "повестей"] },
  story: { en: ["story", "stories"], ru: ["рассказ", "рассказа", "рассказов"] },
  essay: { en: ["essay", "essays"], ru: ["эссе", "эссе", "эссе"] },
  interview: { en: ["interview", "interviews"], ru: ["интервью", "интервью", "интервью"] },
};

/** "novel" / "роман"; plural forms for counts are in `kindForms`. */
export const kindLabel = (kind: BookKind | undefined | null, lang: Lang) => (kind && KINDS[kind] ? KINDS[kind][lang][0] : null);
export const kindForms = (kind: BookKind, lang: Lang) => KINDS[kind][lang];

type Titled = Pick<CorpusEntry, "title"> & { titleEn?: string | null };

/** The title to show first: the English title in English when the store knows one, otherwise the original. */
export const primaryTitle = (b: Titled, lang: Lang) => (lang === "en" && b.titleEn ? b.titleEn : b.title);

/** The other-language title, if it differs from the one shown. */
export function secondaryTitle(b: Titled, lang: Lang) {
  const other = lang === "en" ? b.title : b.titleEn;
  return other && other !== primaryTitle(b, lang) ? other : null;
}
