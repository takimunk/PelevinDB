// Single source of truth for every dimension Jev measures.
// The server builds questions from these rubrics; the client reads labels and colors.

type Levels = readonly [string, string, string, string, string];

export const EMOTIONS = [
  { id: "joy", label: "Joy", color: "#ffd23f", en: "joy and delight" },
  { id: "trust", label: "Trust", color: "#7dff9a", en: "trust, connection and safety" },
  { id: "fear", label: "Fear", color: "#2fe0c0", en: "fear and apprehension" },
  { id: "surprise", label: "Surprise", color: "#6fd6ff", en: "surprise and wonder" },
  { id: "sadness", label: "Sadness", color: "#5a7dff", en: "sadness, grief and longing" },
  { id: "disgust", label: "Disgust", color: "#b77dff", en: "disgust and revulsion" },
  { id: "anger", label: "Anger", color: "#ff4d3a", en: "anger and hostility" },
  { id: "anticipation", label: "Anticipation", color: "#ff9a3c", en: "anticipation and suspense" },
] as const;

export const TEXTURES = [
  {
    id: "pace",
    label: "Pace",
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
  { id: "meditative", label: "Meditative", color: "#8fd3ff", en: "Meditative: quiet contemplation, stillness, reflection." },
  { id: "idyllic", label: "Idyllic", color: "#b6ff6e", en: "Idyllic or cozy: peaceful, safe, pleasant everyday harmony." },
  { id: "melancholic", label: "Melancholic", color: "#6b7cff", en: "Melancholic: wistful sadness, nostalgia, longing." },
  { id: "tender", label: "Tender", color: "#ff8fc8", en: "Tender or romantic: intimacy, affection, love." },
  { id: "playful", label: "Playful", color: "#ffd23f", en: "Playful or comic: lighthearted fun, wit, absurdity." },
  { id: "mysterious", label: "Mysterious", color: "#a77bff", en: "Mysterious or eerie: the strange, uncanny or unexplained." },
  { id: "suspenseful", label: "Suspenseful", color: "#2fe0c0", en: "Suspenseful: anxious waiting, looming threat, unease." },
  { id: "kinetic", label: "Kinetic", color: "#ff7a2f", en: "Kinetic action: chases, fights, rapid physical events." },
  { id: "grim", label: "Grim", color: "#8a7f9e", en: "Grim or dark: cruelty, violence, despair, decay." },
  { id: "solemn", label: "Solemn", color: "#ffb45a", en: "Solemn or epic: grandeur, historical sweep, ceremony, awe." },
  { id: "everyday", label: "Everyday", color: "#9aa5b8", en: "Matter-of-fact: ordinary routine, practical talk or plain information." },
] as const;

export const MODES = [
  { id: "action", label: "Action", color: "#ff7a2f", en: "Action: characters doing things; events unfold on the page." },
  { id: "dialogue", label: "Dialogue", color: "#ffd23f", en: "Dialogue: characters' direct speech dominates." },
  { id: "description", label: "Description", color: "#7dff9a", en: "Description: of places, people, objects or nature." },
  { id: "introspection", label: "Introspection", color: "#6b7cff", en: "Introspection: a character's thoughts, memories or feelings." },
  { id: "exposition", label: "Exposition", color: "#c9b98a", en: "Exposition: backstory, summary of events or background information." },
  { id: "essay", label: "Digression", color: "#b77dff", en: "Authorial digression: the narrator comments or argues directly." },
  { id: "document", label: "Document", color: "#6fd6ff", en: "Document: a letter, diary entry, report or other quoted document." },
  { id: "verse", label: "Verse", color: "#ff8fc8", en: "Verse: poetry or song lyrics." },
  { id: "paratext", label: "Paratext", color: "#3a4150", en: "Not narrative: title page, table of contents, copyright, licence, notes or index." },
] as const;

export const THEMES = [
  { id: "love", label: "Love", en: "romantic love, desire or courtship" },
  { id: "family", label: "Family", en: "family life: parents, children, siblings or marriage" },
  { id: "friendship", label: "Friendship", en: "friendship and loyalty between companions" },
  { id: "death", label: "Death", en: "death, dying or mortality" },
  { id: "war", label: "War", en: "war, battle or organized violence" },
  { id: "power", label: "Power", en: "power, politics, authority or social hierarchy" },
  { id: "money", label: "Money", en: "money, wealth, poverty, work or social class" },
  { id: "crime", label: "Crime", en: "crime, guilt, investigation, punishment or justice" },
  { id: "faith", label: "Faith", en: "God, religion, faith or spirituality" },
  { id: "nature", label: "Nature", en: "nature: landscape, weather, animals or the sea" },
  { id: "journey", label: "Journey", en: "a journey, voyage, travel or quest" },
  { id: "home", label: "Home", en: "home, belonging or homeland" },
  { id: "memory", label: "Memory", en: "memory, the past or nostalgia" },
  { id: "loneliness", label: "Loneliness", en: "loneliness, isolation or alienation" },
  { id: "identity", label: "Identity", en: "self-discovery, coming of age or who a person is" },
  { id: "freedom", label: "Freedom", en: "freedom, captivity, escape or rebellion" },
  { id: "art", label: "Art", en: "art, music, writing or creativity" },
  { id: "science", label: "Science", en: "science, technology or invention" },
  { id: "supernatural", label: "Supernatural", en: "magic, ghosts, monsters or other supernatural things" },
] as const;

export const GENRES = [
  { id: "literary", label: "Literary fiction", en: "Literary or psychological fiction about ordinary life and relationships." },
  { id: "romance", label: "Romance", en: "Romance: a love story is the central plot." },
  { id: "detective", label: "Mystery", en: "Detective or mystery: a crime is investigated and solved." },
  { id: "adventure", label: "Adventure", en: "Adventure or thriller: danger, journeys and action drive the plot." },
  { id: "fantasy", label: "Fantasy", en: "Fantasy or fairy tale: magic and invented wonders." },
  { id: "scifi", label: "Science fiction", en: "Science fiction: invented technology, science or the future." },
  { id: "horror", label: "Gothic & horror", en: "Horror or gothic: terror, the uncanny and the monstrous." },
  { id: "historical", label: "Historical", en: "Historical fiction: the sweep of real historical events." },
  { id: "satire", label: "Satire", en: "Satire or comedy: society is mocked or the aim is laughter." },
  { id: "children", label: "Children", en: "Children's book: written for young readers." },
  { id: "philosophical", label: "Novel of ideas", en: "Novel of ideas: philosophical, moral or religious questions lead." },
  { id: "nonfiction", label: "Nonfiction", en: "Nonfiction: essay, memoir, history, science or philosophy, not a story." },
] as const;

export const ERAS = [
  { id: "antiquity", label: "Antiquity", en: "Antiquity: before about 500 AD, or mythic ancient times." },
  { id: "medieval", label: "Middle Ages", en: "The Middle Ages: about 500–1500." },
  { id: "earlymodern", label: "1500–1800", en: "About 1500–1800." },
  { id: "nineteenth", label: "19th century", en: "The nineteenth century." },
  { id: "earlytwentieth", label: "1900–1945", en: "About 1900–1945." },
  { id: "modern", label: "Modern", en: "After 1945, up to the present day." },
  { id: "future", label: "Future", en: "The future." },
  { id: "invented", label: "Invented world", en: "An invented or timeless world with no real historical period." },
  { id: "unclear", label: "Unclear", en: "The excerpts give no clear indication of the period." },
] as const;

export const PROFILE_SCALES = [
  {
    id: "realism",
    label: "Reality",
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

export const RUBRIC_VERSION = "xbook-rubric-v2";
export const SEGMENT_QUESTION_COUNT =
  EMOTIONS.length + TEXTURES.length + 2 + THEMES.length;
