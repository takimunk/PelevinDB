// Single source of truth for every dimension Jev measures.
// The server builds questions from these rubrics; the client reads labels and colors.

type Levels = readonly [string, string, string, string, string];

export const EMOTIONS = [
  { id: "joy", label: "Joy", ru: "Радость", color: "#dba100", en: "joy and delight" },
  { id: "trust", label: "Trust", ru: "Доверие", color: "#3f9b4f", en: "trust, connection and safety" },
  { id: "fear", label: "Fear", ru: "Страх", color: "#17998a", en: "fear and apprehension" },
  { id: "surprise", label: "Surprise", ru: "Удивление", color: "#2f8fd8", en: "surprise and wonder" },
  { id: "sadness", label: "Sadness", ru: "Грусть", color: "#4a5fd0", en: "sadness, grief and longing" },
  { id: "disgust", label: "Disgust", ru: "Отвращение", color: "#9152c8", en: "disgust and revulsion" },
  { id: "anger", label: "Anger", ru: "Гнев", color: "#d93b30", en: "anger and hostility" },
  { id: "anticipation", label: "Anticipation", ru: "Предвкушение", color: "#e57a1f", en: "anticipation and suspense" },
] as const;

export const TEXTURES = [
  {
    id: "pace",
    label: "Pace",
    ru: "Темп",
    lowRu: "Созерцание",
    highRu: "Действие",
    low: "Meditative",
    high: "Action",
    instructions:
      "How fast does the story move in `passage`: how much physical action and how many events happen?",
    levels: [
      "Stillness: no events happen and time feels suspended, as in contemplation, reverie or static description.",
      "Slow: small quiet actions or an unhurried conversation; very little changes.",
      "Moderate: a few events move the scene forward at an ordinary pace.",
      "Fast: events follow one another quickly; movement and decisions dominate.",
      "Breakneck: continuous rapid action such as a chase, fight, escape or disaster.",
    ] as Levels,
  },
  {
    id: "tension",
    label: "Tension",
    ru: "Напряжение",
    lowRu: "Покой",
    highRu: "Предел",
    low: "Calm",
    high: "Extreme",
    instructions: "How much tension, conflict or suspense is present in `passage`?",
    levels: [
      "None: calm and safe; nothing is at stake.",
      "Mild: slight unease or a minor disagreement.",
      "Clear: an open conflict or suspense with something at stake.",
      "High: danger, confrontation or a crisis is unfolding.",
      "Extreme: life-or-death stakes, a climactic confrontation or terror.",
    ] as Levels,
  },
  {
    id: "interiority",
    label: "Interiority",
    ru: "Внутренний мир",
    lowRu: "Внешнее",
    highRu: "Поток сознания",
    low: "External",
    high: "Stream of mind",
    instructions:
      "How much of `passage` takes place inside a character's mind (thoughts, memories, feelings, perceptions) rather than in outward events or speech?",
    levels: [
      "Entirely external: only actions, speech or facts; no inner life is shown.",
      "Mostly external with a brief glimpse of a thought or feeling.",
      "An even mix of outward events and inner experience.",
      "Mostly inner: a character's thoughts, memories or feelings lead the passage.",
      "Almost entirely inner: stream of consciousness, reverie or memory.",
    ] as Levels,
  },
  {
    id: "imagery",
    label: "Imagery",
    ru: "Образность",
    lowRu: "Сухо",
    highRu: "Пышно",
    low: "Dry",
    high: "Lush",
    instructions:
      "How rich is the sensory and descriptive imagery in `passage`: sights, sounds, textures, smells, landscapes and figurative language?",
    levels: [
      "None: functional or abstract prose with no sensory description.",
      "Sparse: an occasional concrete detail.",
      "Moderate: several clear sensory details or a short description.",
      "Rich: vivid description and figurative language are prominent.",
      "Lush: dense, painterly imagery dominates the passage.",
    ] as Levels,
  },
  {
    id: "ideas",
    label: "Ideas",
    ru: "Идеи",
    lowRu: "Конкретика",
    highRu: "Философия",
    low: "Concrete",
    high: "Philosophy",
    instructions:
      "How much does `passage` dwell on abstract ideas such as philosophy, morality, society, history or faith, rather than on concrete events and things?",
    levels: [
      "Entirely concrete: events, objects and speech with no abstract reflection.",
      "A passing general remark.",
      "Some explicit reflection on an idea alongside concrete events.",
      "Ideas lead: argument, moral reasoning or social commentary is prominent.",
      "Essay-like: the passage is essentially a philosophical or ideological discussion.",
    ] as Levels,
  },
  {
    id: "humor",
    label: "Humor",
    ru: "Юмор",
    lowRu: "Всерьёз",
    highRu: "Фарс",
    low: "Serious",
    high: "Farce",
    instructions: "How much humor, irony or playfulness is present in `passage`?",
    levels: [
      "Entirely serious.",
      "A faint ironic touch.",
      "Noticeable wit or irony.",
      "Clearly comic or satirical.",
      "Overtly comic throughout: farce, jokes or absurdity dominate.",
    ] as Levels,
  },
  {
    id: "valence",
    label: "Light",
    ru: "Свет",
    lowRu: "Тьма",
    highRu: "Свет",
    low: "Dark",
    high: "Light",
    instructions: "What is the overall emotional tone of `passage`, from dark to light?",
    levels: [
      "Bleak: despair, cruelty, loss or dread dominate.",
      "Somber: the mood is heavy or troubled.",
      "Balanced: neither dark nor light, or evenly mixed.",
      "Warm: hopeful, kind or pleasant.",
      "Radiant: joy, love, triumph or wonder dominate.",
    ] as Levels,
  },
] as const;

export const MOODS = [
  { id: "meditative", label: "Meditative", ru: "Созерцательное", color: "#5aa6d6", en: "Meditative: quiet contemplation, stillness, reflection." },
  { id: "idyllic", label: "Idyllic", ru: "Идиллическое", color: "#74ad3c", en: "Idyllic or cozy: peaceful, safe, pleasant everyday harmony." },
  { id: "melancholic", label: "Melancholic", ru: "Меланхоличное", color: "#5c6bc0", en: "Melancholic: wistful sadness, nostalgia, longing." },
  { id: "tender", label: "Tender", ru: "Нежное", color: "#dc6aa0", en: "Tender or romantic: intimacy, affection, love." },
  { id: "playful", label: "Playful", ru: "Игривое", color: "#e0a317", en: "Playful or comic: lighthearted fun, wit, absurdity." },
  { id: "mysterious", label: "Mysterious", ru: "Таинственное", color: "#8e5cd0", en: "Mysterious or eerie: the strange, uncanny or unexplained." },
  { id: "suspenseful", label: "Suspenseful", ru: "Тревожное", color: "#1c9c8a", en: "Suspenseful: anxious waiting, looming threat, unease." },
  { id: "kinetic", label: "Kinetic", ru: "Динамичное", color: "#e4632a", en: "Kinetic action: chases, fights, rapid physical events." },
  { id: "grim", label: "Grim", ru: "Мрачное", color: "#7a6f86", en: "Grim or dark: cruelty, violence, despair, decay." },
  { id: "solemn", label: "Solemn", ru: "Торжественное", color: "#c08a2e", en: "Solemn or epic: grandeur, historical sweep, ceremony, awe." },
  { id: "everyday", label: "Everyday", ru: "Будничное", color: "#8a929e", en: "Matter-of-fact: ordinary routine, practical talk or plain information." },
] as const;

export const MODES = [
  { id: "action", label: "Action", ru: "Действие", color: "#e4632a", en: "Action: characters doing things; events unfold on the page." },
  { id: "dialogue", label: "Dialogue", ru: "Диалог", color: "#dba100", en: "Dialogue: characters' direct speech dominates." },
  { id: "description", label: "Description", ru: "Описание", color: "#3f9b4f", en: "Description: of places, people, objects or nature." },
  { id: "introspection", label: "Introspection", ru: "Самоанализ", color: "#5c6bc0", en: "Introspection: a character's thoughts, memories or feelings." },
  { id: "exposition", label: "Exposition", ru: "Экспозиция", color: "#a8935c", en: "Exposition: backstory, summary of events or background information." },
  { id: "essay", label: "Digression", ru: "Отступление", color: "#9152c8", en: "Authorial digression: the narrator comments or argues directly." },
  { id: "document", label: "Document", ru: "Документ", color: "#2f8fd8", en: "Document: a letter, diary entry, report or other quoted document." },
  { id: "verse", label: "Verse", ru: "Стихи", color: "#dc6aa0", en: "Verse: poetry or song lyrics." },
  { id: "paratext", label: "Paratext", ru: "Паратекст", color: "#9a9893", en: "Not narrative: title page, table of contents, copyright, licence, notes or index." },
] as const;

export const THEMES = [
  { id: "love", label: "Love", ru: "Любовь", en: "romantic love, desire or courtship" },
  { id: "family", label: "Family", ru: "Семья", en: "family life: parents, children, siblings or marriage" },
  { id: "friendship", label: "Friendship", ru: "Дружба", en: "friendship and loyalty between companions" },
  { id: "death", label: "Death", ru: "Смерть", en: "death, dying or mortality" },
  { id: "war", label: "War", ru: "Война", en: "war, battle or organized violence" },
  { id: "power", label: "Power", ru: "Власть", en: "power, politics, authority or social hierarchy" },
  { id: "money", label: "Money", ru: "Деньги", en: "money, wealth, poverty, work or social class" },
  { id: "crime", label: "Crime", ru: "Преступление", en: "crime, guilt, investigation, punishment or justice" },
  { id: "faith", label: "Faith", ru: "Вера", en: "God, religion, faith or spirituality" },
  { id: "nature", label: "Nature", ru: "Природа", en: "nature: landscape, weather, animals or the sea" },
  { id: "journey", label: "Journey", ru: "Путь", en: "a journey, voyage, travel or quest" },
  { id: "home", label: "Home", ru: "Дом", en: "home, belonging or homeland" },
  { id: "memory", label: "Memory", ru: "Память", en: "memory, the past or nostalgia" },
  { id: "loneliness", label: "Loneliness", ru: "Одиночество", en: "loneliness, isolation or alienation" },
  { id: "identity", label: "Identity", ru: "Поиск себя", en: "self-discovery, coming of age or who a person is" },
  { id: "freedom", label: "Freedom", ru: "Свобода", en: "freedom, captivity, escape or rebellion" },
  { id: "art", label: "Art", ru: "Искусство", en: "art, music, writing or creativity" },
  { id: "science", label: "Science", ru: "Наука", en: "science, technology or invention" },
  { id: "supernatural", label: "Supernatural", ru: "Сверхъестественное", en: "magic, ghosts, monsters or other supernatural things" },
] as const;

export const GENRES = [
  { id: "literary", label: "Literary fiction", ru: "Литературная проза", en: "Literary or psychological fiction about ordinary life and relationships." },
  { id: "romance", label: "Romance", ru: "Любовный роман", en: "Romance: a love story is the central plot." },
  { id: "detective", label: "Mystery", ru: "Детектив", en: "Detective or mystery: a crime is investigated and solved." },
  { id: "adventure", label: "Adventure", ru: "Приключения", en: "Adventure or thriller: danger, journeys and action drive the plot." },
  { id: "fantasy", label: "Fantasy", ru: "Фэнтези", en: "Fantasy or fairy tale: magic and invented wonders." },
  { id: "scifi", label: "Science fiction", ru: "Научная фантастика", en: "Science fiction: invented technology, science or the future." },
  { id: "horror", label: "Gothic & horror", ru: "Готика и хоррор", en: "Horror or gothic: terror, the uncanny and the monstrous." },
  { id: "historical", label: "Historical", ru: "Исторический роман", en: "Historical fiction: the sweep of real historical events." },
  { id: "satire", label: "Satire", ru: "Сатира", en: "Satire or comedy: society is mocked or the aim is laughter." },
  { id: "children", label: "Children", ru: "Детская книга", en: "Children's book: written for young readers." },
  { id: "philosophical", label: "Novel of ideas", ru: "Роман идей", en: "Novel of ideas: philosophical, moral or religious questions lead." },
  { id: "nonfiction", label: "Nonfiction", ru: "Нон-фикшн", en: "Nonfiction: essay, memoir, history, science or philosophy, not a story." },
] as const;

export const ERAS = [
  { id: "antiquity", label: "Antiquity", ru: "Античность", en: "Antiquity: before about 500 AD, or mythic ancient times." },
  { id: "medieval", label: "Middle Ages", ru: "Средние века", en: "The Middle Ages: about 500–1500." },
  { id: "earlymodern", label: "1500–1800", ru: "1500–1800", en: "About 1500–1800." },
  { id: "nineteenth", label: "19th century", ru: "XIX век", en: "The nineteenth century." },
  { id: "earlytwentieth", label: "1900–1945", ru: "1900–1945", en: "About 1900–1945." },
  { id: "modern", label: "Modern", ru: "После 1945", en: "After 1945, up to the present day." },
  { id: "future", label: "Future", ru: "Будущее", en: "The future." },
  { id: "invented", label: "Invented world", ru: "Вымышленный мир", en: "An invented or timeless world with no real historical period." },
  { id: "unclear", label: "Unclear", ru: "Неясно", en: "The excerpts give no clear indication of the period." },
] as const;

export const PROFILE_SCALES = [
  {
    id: "realism",
    label: "Reality",
    ru: "Реальность",
    lowRu: "Реализм",
    highRu: "Фантастика",
    low: "Realism",
    high: "Fantastic",
    instructions: "How realistic is the world described in `excerpts`?",
    levels: [
      "Strictly realistic: everything could happen in the real world.",
      "Realistic with rare improbable coincidences or dreams.",
      "Mostly realistic with some uncanny or fantastic elements.",
      "A world where fantastic elements are frequent and accepted.",
      "Wholly fantastical: magic, invented creatures or impossible worlds throughout.",
    ] as Levels,
  },
  {
    id: "scope",
    label: "Scope",
    ru: "Масштаб",
    lowRu: "Камерно",
    highRu: "Эпично",
    low: "Intimate",
    high: "Epic",
    instructions: "How broad is the scope of the story told in `excerpts`?",
    levels: [
      "Intimate: one or two people in a narrow private setting.",
      "A small circle: a family or a few friends.",
      "A community: a town, a household of many people or a social set.",
      "Wide: many characters, places or social layers.",
      "Epic: nations, wars, historical eras or the fate of a world.",
    ] as Levels,
  },
  {
    id: "worldview",
    label: "Worldview",
    ru: "Мировоззрение",
    lowRu: "Отчаяние",
    highRu: "Надежда",
    low: "Despairing",
    high: "Hopeful",
    instructions: "How hopeful is the worldview conveyed by `excerpts`?",
    levels: [
      "Despairing: life appears cruel or meaningless.",
      "Pessimistic: suffering and failure prevail.",
      "Ambivalent: light and dark are balanced.",
      "Hopeful: goodness and meaning can win.",
      "Joyful: the world appears fundamentally good and wondrous.",
    ] as Levels,
  },
  {
    id: "drive",
    label: "Drive",
    ru: "Движущая сила",
    lowRu: "Характеры",
    highRu: "Сюжет",
    low: "Character",
    high: "Plot",
    instructions:
      "In `excerpts`, is the writing driven more by characters' inner lives or by external plot events?",
    levels: [
      "Entirely character-driven: inner life and relationships, almost no plot.",
      "Mostly character-driven.",
      "Balanced between characters and plot.",
      "Mostly plot-driven: events and twists carry the reader.",
      "Entirely plot-driven: constant events with little inner life.",
    ] as Levels,
  },
  {
    id: "complexity",
    label: "Complexity",
    ru: "Сложность",
    lowRu: "Легко",
    highRu: "Плотно",
    low: "Easy",
    high: "Dense",
    instructions: "How demanding is the prose of `excerpts` for an adult reader?",
    levels: [
      "Very simple: short sentences and plain words.",
      "Easy and clear.",
      "Ordinary literary prose.",
      "Dense: long sentences, rich vocabulary or complex structure.",
      "Very demanding: archaic, highly stylized or philosophically dense prose.",
    ] as Levels,
  },
  {
    id: "audience",
    label: "Audience",
    ru: "Аудитория",
    lowRu: "Дети",
    highRu: "Взрослые",
    low: "Children",
    high: "Adult",
    instructions: "For what age of reader is the text in `excerpts` written?",
    levels: [
      "Young children.",
      "Older children.",
      "Teenagers or all ages.",
      "Adults, but accessible to teenagers.",
      "Adults only: mature themes or demanding content.",
    ] as Levels,
  },
] as const;

export type EmotionId = (typeof EMOTIONS)[number]["id"];
export type TextureId = (typeof TEXTURES)[number]["id"];
export type MoodId = (typeof MOODS)[number]["id"];
export type ModeId = (typeof MODES)[number]["id"];
export type ThemeId = (typeof THEMES)[number]["id"];
export type GenreId = (typeof GENRES)[number]["id"];
export type EraId = (typeof ERAS)[number]["id"];
export type ProfileScaleId = (typeof PROFILE_SCALES)[number]["id"];

/**
 * Display labels by interface language. `label`, `low` and `high` stay English (the Jev questions, exports and
 * the brief use them); `ru`, `lowRu` and `highRu` are the Russian interface labels.
 */
export type CatalogLang = "en" | "ru";
type Labelled = { label: string; ru?: string };
type Bipolar = { low: string; high: string; lowRu?: string; highRu?: string };
export const labelOf = (item: Labelled, lang: CatalogLang) => (lang === "ru" && item.ru) || item.label;
export const lowOf = (item: Bipolar, lang: CatalogLang) => (lang === "ru" && item.lowRu) || item.low;
export const highOf = (item: Bipolar, lang: CatalogLang) => (lang === "ru" && item.highRu) || item.high;

export const RUBRIC_VERSION = "xbook-rubric-v2";
export const SEGMENT_QUESTION_COUNT =
  EMOTIONS.length + TEXTURES.length + 2 + THEMES.length;

// ── Sentence level ──────────────────────────────────────────────────────────────────────────────────────────────
// Two requests work below the page. The focus request sends a page once with numbered sentences and asks, for each
// dimension, which sentence carries it most (a Choice over the numbers): one request per page places every page score
// on its sentences. The sentence request reads one sentence with its neighbours and asks what only makes sense for a
// single line (is it a maxim, a punchline, an allusion).

/** Page score a focus dimension distributes over the page's sentences (null: it has no page score). */
export type FocusSource =
  | { group: "emotion"; id: EmotionId }
  | { group: "texture"; id: TextureId; invert?: boolean }
  | null;

/** Anticipation is left out: in the pilot Jev could not place it on a sentence (top-1 agreement at chance). */
export const FOCUS = [
  ...EMOTIONS.filter((e) => e.id !== "anticipation").map((e) => ({ id: e.id, label: e.label, ru: e.ru, color: e.color as string, asks: `conveys the most ${e.en}`, none: `No sentence conveys ${e.en}.`, source: { group: "emotion", id: e.id } as FocusSource })),
  { id: "tension", label: "Tension", ru: "Напряжение", color: "#c0392b", asks: "carries the most tension, conflict or danger", none: "No sentence carries tension.", source: { group: "texture", id: "tension" } },
  { id: "humor", label: "Humor", ru: "Юмор", color: "#e0a317", asks: "is the funniest or most ironic, such as a punchline", none: "No sentence is funny or ironic.", source: { group: "texture", id: "humor" } },
  { id: "ideas", label: "Ideas", ru: "Идеи", color: "#9152c8", asks: "states the most abstract idea about philosophy, society, reality or faith", none: "No sentence states an abstract idea.", source: { group: "texture", id: "ideas" } },
  { id: "imagery", label: "Imagery", ru: "Образность", color: "#3f9b4f", asks: "has the richest sensory or figurative imagery", none: "No sentence has sensory imagery.", source: { group: "texture", id: "imagery" } },
  { id: "interiority", label: "Interiority", ru: "Внутренний мир", color: "#5c6bc0", asks: "goes deepest into a character's thoughts, memories or feelings", none: "No sentence shows inner life.", source: { group: "texture", id: "interiority" } },
  { id: "light", label: "Brightest", ru: "Самое светлое", color: "#dba100", asks: "is the brightest: warm, hopeful or radiant", none: "No sentence is bright.", source: { group: "texture", id: "valence" } },
  { id: "dark", label: "Darkest", ru: "Самое тёмное", color: "#6b5f86", asks: "is the darkest: bleak, cruel or despairing", none: "No sentence is dark.", source: { group: "texture", id: "valence", invert: true } },
  { id: "quotable", label: "Quotable", ru: "Цитата", color: "#c2185b", asks: "would best stand alone as a quotable line: an aphorism, maxim or memorable phrase", none: "No sentence would stand alone as a quote.", source: null },
] as const satisfies readonly { id: string; label: string; ru: string; color: string; asks: string; none: string; source: FocusSource }[];

/** A sentence's pick for "none of them" in a focus Choice. */
export const FOCUS_NONE = "none";

export const SENTENCE_EMOTIONS = [
  ...EMOTIONS.map((e) => ({ id: e.id, label: e.label, ru: e.ru, color: e.color as string, en: `${e.en[0].toUpperCase()}${e.en.slice(1)}.` })),
  { id: "neutral", label: "Neutral", ru: "Нейтрально", color: "#9a9893", en: "Neutral: no particular emotion." },
] as const;

export const SENTENCE_SCALES = [
  {
    id: "valence",
    label: "Light",
    ru: "Свет",
    instructions: "What is the emotional tone of `sentence`, from dark to light?",
    levels: ["Bleak or cruel.", "Somber or troubled.", "Neutral or mixed.", "Warm or hopeful.", "Radiant or joyful."] as Levels,
  },
  {
    id: "arousal",
    label: "Intensity",
    ru: "Накал",
    instructions: "How emotionally intense or agitated is `sentence`?",
    levels: ["Flat: a neutral statement.", "Calm.", "Noticeable feeling.", "Strong feeling or agitation.", "Overwhelming: a cry, an outburst or terror."] as Levels,
  },
  {
    id: "irony",
    label: "Irony",
    ru: "Ирония",
    instructions: "How ironic, sarcastic or mocking is `sentence`: does it mean more or other than it says?",
    levels: ["Entirely sincere.", "A faint ironic shade.", "Clearly ironic.", "Sarcastic or mocking.", "Biting satire or grotesque mockery."] as Levels,
  },
  {
    id: "abstraction",
    label: "Abstraction",
    ru: "Абстрактность",
    instructions: "How abstract is `sentence`, from concrete things and events to metaphysics?",
    levels: [
      "Concrete: a physical action, object or plain fact.",
      "Mostly concrete with a general remark.",
      "A general observation about people or life.",
      "An idea about society, history, mind or faith.",
      "Metaphysics: the nature of reality, the self, emptiness or God.",
    ] as Levels,
  },
  {
    id: "imagery",
    label: "Imagery",
    ru: "Образность",
    instructions: "How rich is the sensory or figurative imagery of `sentence`?",
    levels: ["None: functional or abstract.", "A single concrete detail.", "A clear image.", "Vivid description or a striking metaphor.", "Lush, painterly imagery."] as Levels,
  },
] as const;

export const SENTENCE_FLAGS = [
  { id: "aphorism", label: "Aphorism", ru: "Афоризм", true: "`sentence` would stand alone as an aphorism, maxim or memorable quotable line, meaningful out of context.", false: "`sentence` depends on its context or is an ordinary line." },
  { id: "punchline", label: "Punchline", ru: "Пуант", true: "`sentence` is the punchline of a joke or the comic payoff of what came before.", false: "`sentence` is not a comic payoff." },
  { id: "wordplay", label: "Wordplay", ru: "Игра слов", true: "`sentence` plays on words: a pun, a double meaning, a coinage or a twisted idiom.", false: "`sentence` has no wordplay." },
  { id: "allusion", label: "Allusion", ru: "Аллюзия", true: "`sentence` refers to a specific text, myth, religion, thinker, film, song or public figure.", false: "`sentence` makes no such reference." },
  { id: "illusion", label: "Illusion", ru: "Иллюзорность", true: "`sentence` claims or implies that reality, the self or the world is an illusion, a dream, emptiness or a construct.", false: "`sentence` makes no such claim." },
  { id: "market", label: "Market", ru: "Рынок", true: "`sentence` is about money, brands, advertising, marketing or consumption.", false: "`sentence` is not about money or consumption." },
  { id: "turn", label: "Turn", ru: "Поворот", true: "`sentence` overturns or reframes what `before` set up: a twist, a reversal or a sudden shift of tone.", false: "`sentence` continues what came before." },
] as const;

export const SENTENCE_ACTS = [
  { id: "narration", label: "Narration", ru: "Повествование", color: "#8a929e", en: "Narration: events or description told by the narrator." },
  { id: "speech", label: "Speech", ru: "Реплика", color: "#dba100", en: "Speech: a character's spoken line." },
  { id: "thought", label: "Thought", ru: "Мысль", color: "#5c6bc0", en: "Thought: a character's inner speech, memory or feeling." },
  { id: "comment", label: "Comment", ru: "Комментарий", color: "#9152c8", en: "Comment: the narrator generalises, argues or addresses the reader." },
  { id: "quotation", label: "Quotation", ru: "Цитата", color: "#2f8fd8", en: "Quotation: a document, sign, slogan, verse or text quoted within the story." },
] as const;

export type FocusId = (typeof FOCUS)[number]["id"];
export type SentenceEmotionId = (typeof SENTENCE_EMOTIONS)[number]["id"];
export type SentenceScaleId = (typeof SENTENCE_SCALES)[number]["id"];
export type SentenceFlagId = (typeof SENTENCE_FLAGS)[number]["id"];
export type SentenceActId = (typeof SENTENCE_ACTS)[number]["id"];

export const FOCUS_RUBRIC = "xbook-focus-v1";
export const SENTENCE_RUBRIC = "xbook-sentence-v1";
export const SENTENCE_QUESTION_COUNT = 1 + SENTENCE_SCALES.length + SENTENCE_FLAGS.length + 1;
