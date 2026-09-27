// Development mock with the exact schema of public/blog/eda.json and eda-freq.json.
// Works, years, kinds and word counts mirror data/pelevin.json (the real corpus); every other number is synthetic (seeded noise) and is never shown in production.
import type { Book, Eda, EdaFreq, Kind } from "./data.ts";

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const WORKS: [string, string, string, number, Kind, number][] = [
  ["pv-koldun-ignat-i-lyudi", "Колдун Игнат и люди", "Ignat the Sorcerer and the People", 1989, "story", 416],
  ["pv-zatvornik-i-shestipalyi", "Затворник и Шестипалый", "The Hermit and Six-Toes", 1990, "novella", 9972],
  ["pv-oruzhie-vozmezdiya", "Оружие возмездия", "The Weapon of Retribution", 1990, "story", 3110],
  ["pv-otkrovenie-kregera", "Откровение Крегера", "Kreger's Revelation", 1990, "story", 1521],
  ["pv-rekonstruktor", "Реконструктор", "The Reconstructor", 1990, "story", 1788],
  ["pv-zombifikatsiya", "Зомбификация. Опыт сравнительной антропологии", "Zombification: An Essay in Comparative Anthropology", 1990, "essay", 6859],
  ["pv-prints-gosplana", "Принц Госплана", "The Prince of Gosplan", 1991, "novella", 13707],
  ["pv-vesti-iz-nepala", "Вести из Непала", "News from Nepal", 1991, "story", 5014],
  ["pv-vodonapornaya-bashnya", "Водонапорная башня", "The Water Tower", 1991, "story", 2836],
  ["pv-vstroennyi-napominatel", "Встроенный напоминатель", "The Built-In Reminder", 1991, "story", 911],
  ["pv-devyatyi-son-very-pavlovny", "Девятый сон Веры Павловны", "Vera Pavlovna's Ninth Dream", 1991, "story", 6523],
  ["pv-den-buldozerista", "День бульдозериста", "Bulldozer Driver's Day", 1991, "story", 7966],
  ["pv-sarai-nomer-xii", "Жизнь и приключения сарая номер XII", "The Life and Adventures of Shed Number XII", 1991, "story", 3198],
  ["pv-mardongi", "Мардонги", "Mardongs", 1991, "story", 1301],
  ["pv-mittelshpil", "Миттельшпиль", "Mid-Game", 1991, "story", 7856],
  ["pv-muzyka-so-stolba", "Музыка со столба", "Music from a Pole", 1991, "story", 4218],
  ["pv-ontologiya-detstva", "Онтология детства", "The Ontology of Childhood", 1991, "story", 3247],
  ["pv-problema-verwolka", "Проблема верволка в средней полосе", "A Werewolf Problem in Central Russia", 1991, "story", 10649],
  ["pv-sinii-fonar", "Синий фонарь", "The Blue Lantern", 1991, "story", 3000],
  ["pv-spi", "Спи", "Sleep", 1991, "story", 5159],
  ["pv-sssr-taishou-chzhuan", "СССР Тайшоу Чжуань", "USSR Taishou Zhuan", 1991, "story", 3996],
  ["pv-uhryab", "Ухряб", "Ukhryab", 1991, "story", 3013],
  ["pv-hrustalnyi-mir", "Хрустальный мир", "Crystal World", 1991, "story", 6579],
  ["pv-omon-ra", "Омон Ра", "Omon Ra", 1992, "novel", 30971],
  ["pv-nika", "Ника", "Nika", 1992, "story", 4479],
  ["pv-proishozhdenie-vidov", "Происхождение видов", "The Origin of Species", 1992, "story", 3801],
  ["pv-zhizn-nasekomyh", "Жизнь насекомых", "The Life of Insects", 1993, "novel", 43949],
  ["pv-zheltaya-strela", "Желтая стрела", "The Yellow Arrow", 1993, "novella", 13061],
  ["pv-buben-verhnego-mira", "Бубен верхнего мира", "The Tambourine of the Upper World", 1993, "story", 3888],
  ["pv-zigmund-v-kafe", "Зигмунд в кафе", "Sigmund in a Café", 1993, "story", 1887],
  ["pv-ivan-kublahanov", "Иван Кублаханов", "Ivan Kublakhanov", 1993, "story", 2922],
  ["pv-tarzanka", "Тарзанка", "Tarzanka", 1993, "story", 4914],
  ["pv-gkchp-kak-tetragrammaton", "ГКЧП как тетраграмматон", "The State Emergency Committee as Tetragrammaton", 1993, "essay", 911],
  ["pv-dzhon-faulz", "Джон Фаулз и трагедия русского либерализма", "John Fowles and the Tragedy of Russian Liberalism", 1993, "essay", 1236],
  ["pv-podzemnoe-nebo", "Подземное небо", "The Underground Sky", 1994, "essay", 987],
  ["pv-chapaev-i-pustota", "Чапаев и Пустота", "Chapaev and Void", 1996, "novel", 91895],
  ["pv-buben-nizhnego-mira", "Бубен нижнего мира", "The Tambourine of the Lower World", 1996, "story", 1415],
  ["pv-kratkaya-istoriya-peintbola", "Краткая история пэйнтбола в Москве", "A Short History of Paintball in Moscow", 1996, "story", 4867],
  ["pv-nizhnyaya-tundra", "Нижняя тундра", "The Lower Tundra", 1996, "story", 5905],
  ["pv-svyatochnyi-kiberpank", "Святочный киберпанк, или Рождественская ночь-117.DIR", "Christmas Cyberpunk, or Christmas Night-117.DIR", 1996, "story", 3697],
  ["pv-ikstlan-petushki", "Икстлан – Петушки", "Ixtlan – Petushki", 1996, "essay", 1232],
  ["pv-moi-meskalitovyi-trip", "Мой мескалитовый трип", "My Mescalito Trip", 1996, "essay", 1107],
  ["pv-zapis-o-poiske-vetra", "Запись о поиске ветра", "A Record of the Search for the Wind", 1997, "story", 3902],
  ["pv-time-out", "Time Out, или Вечерняя Москва", "Time Out, or Evening Moscow", 1997, "story", 2248],
  ["pv-imena-oligarhov", "Имена олигархов на карте Родины", "The Names of Oligarchs on the Map of the Motherland", 1998, "essay", 1461],
  ["pv-most-kotoryi-ya-hotel-pereiti", "Мост, который я хотел перейти", "The Bridge I Wanted to Cross", 1998, "essay", 395],
  ["pv-poslednyaya-shutka-voina", "Последняя шутка воина", "The Warrior's Last Joke", 1998, "essay", 634],
  ["pv-generation-p", "Generation «П»", "Generation P", 1999, "novel", 67649],
  ["pv-grecheskii-variant", "Греческий вариант", "The Greek Version", 1999, "story", 2951],
  ["pv-sprashivaet-prov", "Виктор Пелевин спрашивает PRов", "Viktor Pelevin Questions the PR Men", 1999, "essay", 1464],
  ["pv-ultima-tuleev", "Ultima Тулеев, или Дао выборов", "Ultima Tuleev, or the Tao of Elections", 2000, "essay", 1092],
  ["pv-svet-gorizonta", "Свет горизонта", "The Light of the Horizon", 2001, "story", 6508],
  ["pv-kod-mira", "Код Мира", "The Mir Code", 2001, "essay", 981],
  ["pv-chisla", "Числа", "Numbers", 2003, "novel", 56384],
  ["pv-makedonskaya-kritika", "Македонская критика французской мысли", "The Macedonian Critique of French Thought", 2003, "novella", 8184],
  ["pv-akiko", "Акико", "Akiko", 2003, "story", 3895],
  ["pv-gost-na-prazdnike-bon", "Гость на празднике Бон", "A Guest at the Bon Festival", 2003, "story", 3703],
  ["pv-odin-vog", "Один вог", "One Vogue", 2003, "story", 397],
  ["pv-fokus-gruppa", "Фокус-группа", "Focus Group", 2003, "story", 7068],
  ["pv-svyashchennaya-kniga-oborotnya", "Священная книга оборотня", "The Sacred Book of the Werewolf", 2004, "novel", 79093],
  ["pv-shlem-uzhasa", "Шлем ужаса", "The Helmet of Horror", 2005, "novel", 24434],
  ["pv-papahi-na-bashnyah", "Папахи на башнях", "Papakhas on the Towers", 2005, "story", 3961],
  ["pv-who-by-fire", "Who by Fire", "Who by Fire", 2005, "story", 3064],
  ["pv-empire-v", "Empire V", "Empire V", 2006, "novel", 81478],
  ["pv-zal-poyushchih-kariatid", "Зал поющих кариатид", "The Hall of the Singing Caryatids", 2008, "novella", 18893],
  ["pv-assasin", "Ассасин", "Assassin", 2008, "story", 9994],
  ["pv-kormlenie-krokodila-hufu", "Кормление крокодила Хуфу", "Feeding the Crocodile Khufu", 2008, "story", 5679],
  ["pv-nekroment", "Некромент", "Necroment", 2008, "story", 9291],
  ["pv-prostranstvo-fridmana", "Пространство Фридмана", "Friedman Space", 2008, "story", 3282],
  ["pv-t", "t", "t", 2009, "novel", 90666],
  ["pv-zenitnye-kodeksy", "Зенитные кодексы Аль-Эфесби", "The Anti-Aircraft Codices of Al-Efesbi", 2010, "novella", 16343],
  ["pv-operatsiya-burning-bush", "Операция «Burning Bush»", "Operation Burning Bush", 2010, "novella", 27579],
  ["pv-sozertsatel-teni", "Созерцатель тени", "The Shadow Watcher", 2010, "novella", 10375],
  ["pv-otel-horoshih-voploshchenii", "Отель хороших воплощений", "The Hotel of Good Incarnations", 2010, "story", 4595],
  ["pv-thagi", "Тхаги", "Thugs", 2010, "story", 6366],
  ["pv-snuff", "S.N.U.F.F.", "S.N.U.F.F.", 2011, "novel", 107241],
  ["pv-46-intervyu", "46 интервью с Пелевиным", "46 Interviews with Pelevin", 2012, "interview", 94617],
  ["pv-betman-apollo", "Бэтман Аполло", "Batman Apollo", 2013, "novel", 112104],
  ["pv-lyubov-k-trem-tsukerbrinam", "Любовь к трем цукербринам", "Love for Three Zuckerbrins", 2014, "novel", 85909],
  ["pv-zheleznaya-bezdna", "Смотритель. Железная бездна", "The Watcher. The Iron Abyss", 2015, "novel", 57211],
  ["pv-orden-zheltogo-flaga", "Смотритель. Орден желтого флага", "The Watcher. The Order of the Yellow Flag", 2015, "novel", 49592],
  ["pv-lampa-mafusaila", "Лампа Мафусаила, или Крайняя битва чекистов с масонами", "Methuselah's Lamp, or The Final Battle of the Chekists and the Masons", 2016, "novel", 82328],
  ["pv-iphuck-10", "iPhuck 10", "iPhuck 10", 2017, "novel", 82094],
  ["pv-tainye-vidy-na-goru-fudzi", "Тайные виды на гору Фудзи", "Secret Views of Mount Fuji", 2018, "novel", 82578],
  ["pv-iakinf", "Иакинф", "Iakinf", 2019, "novella", 21927],
  ["pv-iskusstvo-legkih-kasanii", "Искусство легких касаний", "The Art of Light Touches", 2019, "novella", 39790],
  ["pv-stolypin", "Столыпин", "Stolypin", 2019, "story", 9695],
  ["pv-nepobedimoe-solntse", "Непобедимое солнце", "Invincible Sun", 2020, "novel", 115439],
  ["pv-transhumanism-inc", "Transhumanism Inc.", "Transhumanism Inc.", 2021, "novel", 99459],
  ["pv-kgbt", "KGBT+", "KGBT+", 2022, "novel", 91393],
  ["pv-puteshestvie-v-elevsin", "Путешествие в Элевсин", "Journey to Eleusis", 2023, "novel", 75694],
  ["pv-krut", "Круть", "Krut", 2024, "novel", 75205],
  ["pv-a-sinistra", "A Sinistra", "A Sinistra", 2025, "novel", 75425],
  ["pv-vozvrashchenie-sinei-borody", "Возвращение Синей Бороды", "The Return of Bluebeard", 2026, "novel", 68953],
];

const FIELDS: [string, string, string, string[]][] = [
  ["emptiness", "Emptiness & Buddhism", "Пустота и буддизм", ["пустота", "будда", "ум", "сознание", "нирвана", "дхарма", "медитация", "иллюзия", "майя", "просветление"]],
  ["money", "Money & advertising", "Деньги и реклама", ["деньги", "бабло", "доллар", "реклама", "бренд", "рынок", "бизнес", "кредит", "банк", "баблос"]],
  ["power", "Power, state, chekists", "Власть, государство, чекисты", ["власть", "государство", "чекист", "генерал", "кремль", "спецслужба", "президент", "фсб", "контора", "полковник"]],
  ["tech", "Technology & AI", "Технологии и ИИ", ["компьютер", "интернет", "алгоритм", "нейросеть", "гаджет", "сеть", "программа", "робот", "искусственный", "цифровой"]],
  ["drugs", "Drugs", "Наркотики", ["гриб", "кокаин", "героин", "кислота", "мухомор", "трава", "доза", "таблетка", "препарат", "нюхать"]],
  ["animals", "Insects & animals", "Насекомые и звери", ["муха", "комар", "навозный", "жук", "лиса", "волк", "курица", "муравей", "моль", "бабочка"]],
  ["supernatural", "Supernatural", "Сверхъестественное", ["вампир", "оборотень", "демон", "дух", "призрак", "колдун", "магия", "бес", "нечисть", "заклинание"]],
  ["religion", "Religion", "Религия", ["бог", "господь", "церковь", "молитва", "грех", "христос", "ангел", "душа", "рай", "ад"]],
  ["death", "Death", "Смерть", ["смерть", "умереть", "труп", "могила", "гроб", "покойник", "убить", "похороны", "погибнуть", "мёртвый"]],
  ["soviet", "Soviet past", "Советское прошлое", ["советский", "партия", "комсомол", "ленин", "ссср", "пионер", "коммунизм", "райком", "товарищ", "сталин"]],
  ["body", "Body", "Тело", ["рука", "глаз", "лицо", "голова", "тело", "нога", "кожа", "грудь", "палец", "губа"]],
  ["violence", "Violence & war", "Насилие и война", ["война", "пистолет", "стрелять", "автомат", "солдат", "бой", "кровь", "взрыв", "пуля", "убийство"]],
  ["mind", "Mind & dream", "Ум и сон", ["сон", "мысль", "сниться", "реальность", "мир", "восприятие", "галлюцинация", "видение", "память", "грёза"]],
];

// Rough shapes over time for each field: [early, middle, late] level per 10k words.
const FIELD_SHAPE: Record<string, [number, number, number]> = {
  emptiness: [18, 42, 30],
  money: [6, 38, 22],
  power: [10, 20, 36],
  tech: [4, 12, 40],
  drugs: [8, 22, 10],
  animals: [30, 8, 4],
  supernatural: [14, 30, 12],
  religion: [12, 18, 24],
  death: [20, 16, 14],
  soviet: [34, 12, 8],
  body: [60, 55, 58],
  violence: [14, 18, 20],
  mind: [26, 34, 30],
};

const WORDS = [
  "пустота",
  "деньга",
  "деньги",
  "бабло",
  "реклама",
  "гламур",
  "дискурс",
  "вампир",
  "сознание",
  "чекист",
  "ум",
  "баблос",
  "интернет",
  "бог",
  "реальность",
  "мир",
  "человек",
  "жизнь",
  "время",
  "свет",
  "тьма",
  "сон",
  "сердце",
  "дух",
  "космос",
  "луна",
  "солнце",
  "машина",
  "город",
  "москва",
  "россия",
  "америка",
  "запад",
  "война",
  "любовь",
  "смерть",
  "страх",
  "бардо",
  "колесо",
  "сансара",
  "будда",
  "дракон",
  "лиса",
  "муха",
  "комар",
  "навоз",
  "жук",
  "реклама",
  "бренд",
  "телевизор",
  "нефть",
  "газ",
  "политтехнолог",
  "оборотень",
  "хамлет",
  "цукербрин",
  "сеть",
  "алгоритм",
  "нейросеть",
  "гаджет",
  "айфак",
  "фудзи",
  "свобода",
  "власть",
  "генерал",
  "полковник",
  "кремль",
  "советский",
  "ленин",
  "партия",
  "пионер",
  "тело",
];

export function mockEda(): Eda {
  const r = rng(42);
  const n = WORKS.length;
  const t = (year: number) => (year - 1989) / 37;
  const books: Book[] = WORKS.map(([id, title, titleEn, year, kind, words]) => {
    const tt = t(year);
    const sentenceLen = 11 + tt * 3 + (kind === "essay" ? 6 : kind === "interview" ? 2 : 0) + (r() - 0.5) * 3;
    const sentences = Math.round(words / sentenceLen);
    return {
      id,
      title,
      titleEn,
      year,
      kind,
      words,
      sentences,
      lemmas: Math.round(Math.pow(words, 0.72) * (1.6 + r() * 0.3)),
      mattr: 0.78 + (r() - 0.5) * 0.05 - tt * 0.015 + (kind === "essay" ? 0.02 : 0),
      sentenceLen,
      sentenceLenP90: sentenceLen * (1.9 + r() * 0.3),
      wordLen: 5.1 + tt * 0.25 + (r() - 0.5) * 0.2,
      dialogueShare: Math.max(0.02, (kind === "essay" ? 0.02 : kind === "interview" ? 0.5 : 0.18 + tt * 0.2) + (r() - 0.5) * 0.12),
      questionShare: 0.05 + tt * 0.04 + (r() - 0.5) * 0.03,
      exclaimShare: 0.04 - tt * 0.015 + r() * 0.02,
      hapaxShare: 0.5 - Math.log10(words) * 0.05 + (r() - 0.5) * 0.04,
      pronounI: (kind === "essay" ? 4 : 12 + tt * 8) + (r() - 0.5) * 10,
      pronounWe: 2 + r() * 3 + (kind === "interview" ? 3 : 0),
    };
  });

  const fieldVals = FIELDS.map(([key]) =>
    books.map((b) => {
      const [a, m, z] = FIELD_SHAPE[key];
      const tt = t(b.year);
      const base = tt < 0.5 ? a + (m - a) * tt * 2 : m + (z - m) * (tt - 0.5) * 2;
      return Math.max(0, base * (0.5 + r() * 1.1));
    }),
  );

  const vocab = [...new Set(WORDS)];
  const distinctive: Eda["distinctive"] = {};
  for (const b of books) {
    const picks = [...vocab].sort(() => r() - 0.5).slice(0, 30);
    distinctive[b.id] = picks.map((w, k) => [w, +(12 - k * 0.35 + r()).toFixed(2)] as [string, number]).sort((x, y) => y[1] - x[1]);
  }

  const lsa = books.map((b) => [t(b.year) * 2 - 1 + (r() - 0.5) * 0.6, (b.kind === "novel" ? 0.4 : -0.3) + (r() - 0.5) * 0.8] as [number, number]);
  const tsne = books.map(() => [(r() - 0.5) * 40, (r() - 0.5) * 40] as [number, number]);

  const similarity = books.map((a, i) =>
    books.map((b, j) => {
      if (i === j) return 1;
      const d = Math.hypot(lsa[i][0] - lsa[j][0], lsa[i][1] - lsa[j][1]);
      return +Math.max(0.05, 0.75 - d * 0.35 + (r() - 0.5) * 0.08).toFixed(3);
    }),
  );
  // symmetric
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) similarity[i][j] = similarity[j][i];

  const topicTerms = [
    ["пустота", "ум", "будда", "сознание", "мир", "иллюзия", "нирвана", "колесо"],
    ["деньги", "реклама", "бренд", "бабло", "телевизор", "политтехнолог", "нефть", "бизнес"],
    ["вампир", "язык", "баблос", "ум", "халдей", "гламур", "дискурс", "укус"],
    ["чекист", "генерал", "контора", "полковник", "власть", "кремль", "служба", "операция"],
    ["алгоритм", "нейросеть", "гаджет", "сеть", "банка", "мозг", "трансгуманизм", "цифровой"],
    ["муха", "комар", "жук", "навоз", "шар", "насекомое", "моль", "крылья"],
    ["советский", "партия", "пионер", "лётчик", "космос", "луна", "ленин", "комсомол"],
    ["лиса", "хвост", "оборотень", "волк", "сверхоборотень", "генерал", "нефть", "собака"],
    ["бог", "граф", "автор", "роман", "церковь", "душа", "текст", "христос"],
    ["женщина", "любовь", "секс", "феминизм", "мужчина", "тело", "гендер", "желание"],
  ];
  const topics = topicTerms.map((terms, k) => ({
    id: k,
    terms,
    perBook: books.map((b) => Math.max(0, Math.sin(t(b.year) * 3 + k) * 0.3 + r() * 0.25)),
  }));
  // normalise per book so shares sum to 1
  books.forEach((_, i) => {
    const s = topics.reduce((a, tp) => a + tp.perBook[i], 0) || 1;
    topics.forEach((tp) => (tp.perBook[i] = +(tp.perBook[i] / s).toFixed(4)));
  });

  return {
    version: 1,
    generated: "2026-09-27T00:00:00.000Z",
    method: {
      tokenizer: "razdel (mock)",
      lemmatizer: "pymorphy3 (mock)",
      stopwords: 520,
      vocabSize: 4000,
      notes: ["MOCK DATA — synthetic numbers for development only."],
    },
    books,
    distinctive,
    fields: FIELDS.map(([key, en, ru, lemmas], k) => ({ key, en, ru, lemmas, perBook: fieldVals[k].map((v) => +v.toFixed(2)) })),
    map: {
      lsa,
      tsne,
      components: [
        { positive: ["алгоритм", "сеть", "банка", "трансгуманизм", "цифровой"], negative: ["советский", "партия", "муха", "пионер", "комар"] },
        { positive: ["вампир", "баблос", "ум", "язык", "гламур"], negative: ["пустота", "будда", "колесо", "сон", "лиса"] },
      ],
    },
    similarity,
    topics,
  };
}

export function mockFreq(): EdaFreq {
  const r = rng(7);
  const eda = mockEda();
  const vocab = [...new Set([...WORDS, ...FIELDS.flatMap((f) => f[3]), ...eda.topics.flatMap((t) => t.terms)])].sort((a, b) => a.localeCompare(b, "ru"));
  const perBook = eda.books.map((b) => {
    const tt = (b.year - 1989) / 37;
    return vocab.map((w, k) => {
      const phase = (k * 0.37) % 1;
      const bump = Math.exp(-Math.pow((tt - phase) / 0.22, 2));
      return +Math.max(0, bump * (4 + (k % 7) * 3) * (0.4 + r() * 1.2) - 0.6).toFixed(2);
    });
  });
  const totals = vocab.map((_, k) => Math.round(perBook.reduce((a, row, i) => a + (row[k] * eda.books[i].words) / 10000, 0)));
  return { vocab, perBook, totals };
}
