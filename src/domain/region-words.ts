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
