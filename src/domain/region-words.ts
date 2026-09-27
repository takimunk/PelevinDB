/**
 * Words for naming map regions, keyed like map axes ("group:key").
 * `noun`/`adj` describe a region where the feature is high; `low` exists only for
 * bipolar scales, where a low value means something too (dark, calm, intimate).
 */
export type RegionWords = { noun: string; adj: string; low?: { noun: string; adj: string } };

const w = (noun: string, adj: string, low?: [string, string]): RegionWords => ({ noun, adj, ...(low && { low: { noun: low[0], adj: low[1] } }) });

export const REGION_WORDS: Record<string, RegionWords> = {
  "emotions:joy": w("joy", "joyful"),
  "emotions:trust": w("trust", "gentle"),
  "emotions:fear": w("fear", "fearful"),
  "emotions:surprise": w("wonder", "startled"),
  "emotions:sadness": w("sorrow", "sorrowful"),
  "emotions:disgust": w("revulsion", "bitter"),
  "emotions:anger": w("rage", "angry"),
  "emotions:anticipation": w("suspense", "restless"),

  "texture:pace": w("speed", "swift", ["stillness", "still"]),
  "texture:tension": w("danger", "tense", ["calm", "calm"]),
  "texture:interiority": w("dreams", "inward", ["deeds", "outward"]),
  "texture:imagery": w("colour", "lush", ["plain words", "plain"]),
  "texture:ideas": w("ideas", "thoughtful", ["things", "concrete"]),
  "texture:humor": w("laughter", "comic", ["gravity", "serious"]),
  "texture:valence": w("light", "bright", ["shadows", "dark"]),

  "mood:meditative": w("reverie", "quiet"),
  "mood:idyllic": w("idylls", "cosy"),
  "mood:melancholic": w("longing", "wistful"),
  "mood:tender": w("tenderness", "tender"),
  "mood:playful": w("play", "playful"),
  "mood:mysterious": w("mysteries", "eerie"),
  "mood:suspenseful": w("suspense", "uneasy"),
  "mood:kinetic": w("chases", "kinetic"),
  "mood:grim": w("ruin", "grim"),
  "mood:solemn": w("grandeur", "solemn"),
  "mood:everyday": w("routine", "everyday"),

  "mode:action": w("deeds", "busy"),
  "mode:dialogue": w("talk", "talkative"),
  "mode:description": w("landscapes", "painterly"),
  "mode:introspection": w("inner voices", "brooding"),
  "mode:exposition": w("chronicles", "storied"),
  "mode:essay": w("sermons", "opinionated"),
  "mode:document": w("letters", "epistolary"),
  "mode:verse": w("song", "lyrical"),

  "themes:love": w("love", "romantic"),
  "themes:family": w("families", "domestic"),
  "themes:friendship": w("friends", "loyal"),
  "themes:death": w("mortality", "mourning"),
  "themes:war": w("war", "warring"),
  "themes:power": w("thrones", "political"),
  "themes:money": w("money", "mercantile"),
  "themes:crime": w("crime", "guilty"),
  "themes:faith": w("faith", "devout"),
  "themes:nature": w("wild things", "wild"),
  "themes:journey": w("roads", "wandering"),
  "themes:home": w("home", "homely"),
  "themes:memory": w("memory", "nostalgic"),
  "themes:loneliness": w("solitude", "lonely"),
  "themes:identity": w("becoming", "searching"),
  "themes:freedom": w("freedom", "rebel"),
  "themes:art": w("art", "artful"),
  "themes:science": w("invention", "inventive"),
  "themes:supernatural": w("ghosts", "haunted"),

  "arc:act0": w("bright beginnings", "sunlit", ["dark beginnings", "overcast"]),
  "arc:act1": w("easy starts", "hopeful", ["hard starts", "troubled"]),
  "arc:act2": w("bright middles", "buoyant", ["dark middles", "sinking"]),
  "arc:act3": w("reprieves", "rising", ["downfalls", "falling"]),
  "arc:act4": w("happy endings", "redeemed", ["tragedy", "tragic"]),
  "arc:volatility": w("storms", "stormy", ["even keels", "steady"]),

  "profile:literary": w("ordinary lives", "literary"),
  "profile:romance": w("courtship", "romantic"),
  "profile:detective": w("clues", "detective"),
  "profile:adventure": w("adventure", "daring"),
  "profile:fantasy": w("fairy tales", "enchanted"),
  "profile:scifi": w("machines", "futurist"),
  "profile:horror": w("horror", "gothic"),
  "profile:historical": w("history", "historic"),
  "profile:satire": w("satire", "satirical"),
  "profile:children": w("childhood", "childlike"),
  "profile:philosophical": w("ideas", "philosophic"),
  "profile:nonfiction": w("fact", "factual"),
  "profile:antiquity": w("myth", "ancient"),
  "profile:medieval": w("knights", "medieval"),
  "profile:earlymodern": w("old courts", "courtly"),
  "profile:nineteenth": w("gaslight", "victorian"),
  "profile:earlytwentieth": w("the new century", "modernist"),
  "profile:modern": w("the present", "modern"),
  "profile:future": w("tomorrow", "future"),
  "profile:invented": w("invented worlds", "invented"),
  "profile:realism": w("marvels", "fantastic", ["plain facts", "realist"]),
  "profile:scope": w("empires", "epic", ["small rooms", "intimate"]),
  "profile:worldview": w("hope", "hopeful", ["despair", "despairing"]),
  "profile:drive": w("twists", "plotted", ["inner lives", "reflective"]),
  "profile:complexity": w("labyrinths", "dense", ["simple words", "easy"]),
  "profile:audience": w("grown-ups", "mature", ["children", "young"]),
};

/** Place words by how much of the map a region holds. */
export const PLACES = {
  small: ["corner", "cove", "nook", "island"],
  medium: ["quarter", "valley", "harbour", "grove"],
  large: ["province", "coast", "plains", "realm"],
} as const;

/**
 * Russian words for the same features: `noun` is already in the genitive ("гавань идей"), `adj` is the
 * masculine form and agrees with the place word through `agree()`, e.g. "Тихая гавань идей".
 */
const r = (noun: string, adj: string, low?: [string, string]): RegionWords => ({ noun, adj, ...(low && { low: { noun: low[0], adj: low[1] } }) });

export const REGION_WORDS_RU: Record<string, RegionWords> = {
  "emotions:joy": r("радости", "радостный"),
  "emotions:trust": r("доверия", "кроткий"),
  "emotions:fear": r("страха", "испуганный"),
  "emotions:surprise": r("чудес", "изумлённый"),
  "emotions:sadness": r("печали", "печальный"),
  "emotions:disgust": r("отвращения", "горький"),
  "emotions:anger": r("ярости", "гневный"),
  "emotions:anticipation": r("ожидания", "беспокойный"),

  "texture:pace": r("скорости", "стремительный", ["тишины", "неподвижный"]),
  "texture:tension": r("опасности", "напряжённый", ["покоя", "спокойный"]),
  "texture:interiority": r("грёз", "мечтательный", ["дел", "внешний"]),
  "texture:imagery": r("красок", "пышный", ["простых слов", "скупой"]),
  "texture:ideas": r("идей", "вдумчивый", ["вещей", "предметный"]),
  "texture:humor": r("смеха", "смешливый", ["серьёзности", "серьёзный"]),
  "texture:valence": r("света", "светлый", ["теней", "тёмный"]),

  "mood:meditative": r("раздумий", "тихий"),
  "mood:idyllic": r("идиллий", "уютный"),
  "mood:melancholic": r("тоски", "грустный"),
  "mood:tender": r("нежности", "нежный"),
  "mood:playful": r("игры", "игривый"),
  "mood:mysterious": r("тайн", "зловещий"),
  "mood:suspenseful": r("тревоги", "тревожный"),
  "mood:kinetic": r("погонь", "бурный"),
  "mood:grim": r("руин", "мрачный"),
  "mood:solemn": r("величия", "торжественный"),
  "mood:everyday": r("будней", "будничный"),

  "mode:action": r("поступков", "деятельный"),
  "mode:dialogue": r("разговоров", "говорливый"),
  "mode:description": r("пейзажей", "живописный"),
  "mode:introspection": r("внутренних голосов", "задумчивый"),
  "mode:exposition": r("хроник", "летописный"),
  "mode:essay": r("проповедей", "назидательный"),
  "mode:document": r("писем", "эпистолярный"),
  "mode:verse": r("песен", "лирический"),

  "themes:love": r("любви", "влюблённый"),
  "themes:family": r("семьи", "домашний"),
  "themes:friendship": r("дружбы", "верный"),
  "themes:death": r("смерти", "скорбный"),
  "themes:war": r("войны", "воинственный"),
  "themes:power": r("тронов", "политический"),
  "themes:money": r("денег", "торговый"),
  "themes:crime": r("преступлений", "криминальный"),
  "themes:faith": r("веры", "набожный"),
  "themes:nature": r("дикой природы", "дикий"),
  "themes:journey": r("дорог", "странствующий"),
  "themes:home": r("дома", "родной"),
  "themes:memory": r("памяти", "ностальгический"),
  "themes:loneliness": r("одиночества", "одинокий"),
  "themes:identity": r("становления", "ищущий"),
  "themes:freedom": r("свободы", "мятежный"),
  "themes:art": r("искусства", "изысканный"),
  "themes:science": r("изобретений", "изобретательный"),
  "themes:supernatural": r("призраков", "призрачный"),

  "arc:act0": r("светлых начал", "солнечный", ["тёмных начал", "пасмурный"]),
  "arc:act1": r("лёгких стартов", "обнадёживающий", ["трудных стартов", "смутный"]),
  "arc:act2": r("светлых середин", "бодрый", ["тёмных середин", "тонущий"]),
  "arc:act3": r("передышек", "восходящий", ["падений", "падающий"]),
  "arc:act4": r("счастливых концов", "спасённый", ["трагедий", "трагический"]),
  "arc:volatility": r("бурь", "штормовой", ["ровного хода", "ровный"]),

  "profile:literary": r("обычных жизней", "литературный"),
  "profile:romance": r("ухаживаний", "романтический"),
  "profile:detective": r("улик", "детективный"),
  "profile:adventure": r("приключений", "отважный"),
  "profile:fantasy": r("сказок", "волшебный"),
  "profile:scifi": r("машин", "футуристический"),
  "profile:horror": r("ужаса", "готический"),
  "profile:historical": r("истории", "исторический"),
  "profile:satire": r("сатиры", "сатирический"),
  "profile:children": r("детства", "детский"),
  "profile:philosophical": r("идей", "философский"),
  "profile:nonfiction": r("фактов", "документальный"),
  "profile:antiquity": r("мифов", "древний"),
  "profile:medieval": r("рыцарей", "средневековый"),
  "profile:earlymodern": r("старых дворов", "придворный"),
  "profile:nineteenth": r("газовых фонарей", "викторианский"),
  "profile:earlytwentieth": r("нового века", "модернистский"),
  "profile:modern": r("современности", "современный"),
  "profile:future": r("завтрашнего дня", "грядущий"),
  "profile:invented": r("вымышленных миров", "вымышленный"),
  "profile:realism": r("чудес", "фантастический", ["голых фактов", "реалистичный"]),
  "profile:scope": r("империй", "эпический", ["маленьких комнат", "камерный"]),
  "profile:worldview": r("надежды", "обнадёживающий", ["отчаяния", "безнадёжный"]),
  "profile:drive": r("поворотов", "сюжетный", ["внутренних жизней", "созерцательный"]),
  "profile:complexity": r("лабиринтов", "плотный", ["простых слов", "лёгкий"]),
  "profile:audience": r("взрослых", "зрелый", ["детей", "юный"]),
};

export type Gender = "m" | "f" | "n";
/** Same tiers and order as PLACES, so a region gets the matching place in both languages. */
export const PLACES_RU: Record<keyof typeof PLACES, readonly { word: string; gender: Gender }[]> = {
  small: [
    { word: "уголок", gender: "m" },
    { word: "бухта", gender: "f" },
    { word: "закуток", gender: "m" },
    { word: "остров", gender: "m" },
  ],
  medium: [
    { word: "квартал", gender: "m" },
    { word: "долина", gender: "f" },
    { word: "гавань", gender: "f" },
    { word: "роща", gender: "f" },
  ],
  large: [
    { word: "провинция", gender: "f" },
    { word: "побережье", gender: "n" },
    { word: "равнина", gender: "f" },
    { word: "царство", gender: "n" },
  ],
};

/** A masculine adjective ("тихий", "светлый", "родной", "синий") in the given gender, or plural ("p"). */
export function agree(adj: string, gender: Gender | "p"): string {
  if (gender === "m") return adj;
  const stem = adj.slice(0, -2),
    end = adj.slice(-2);
  const velar = /[гкх]$/.test(stem),
    hush = /[жшчщ]$/.test(stem);
  if (end === "ий" && !velar && !hush) return stem + { f: "яя", n: "ее", p: "ие" }[gender];
  if (gender === "f") return stem + "ая";
  if (gender === "n") return stem + (hush && end === "ий" ? "ее" : "ое");
  return stem + (velar || hush ? "ие" : "ые");
}
