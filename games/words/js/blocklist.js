// Words left out of every list: slurs, profanity and crude sexual terms.
// A puzzle should never show one as an answer or build a grid around it.
// Players can still type whatever they like; these just never score.
//
// STEMS block every word that starts with them (they have no innocent
// longer forms); WORDS block exact matches only, so "class", "cockpit" and
// "scunthorpe"-style words stay playable.

const STEMS = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'wank', 'twat', 'bollock', 'bullshit', 'motherf', 'dickhead', 'jizz', 'cocksuck', 'arsehol', 'asshol', 'whore', 'spic', 'kike', 'chink', 'gook', 'wetback', 'raghead', 'towelhead', 'tranny', 'retard', 'dyke', 'faggot', 'poofter', 'coon'];

const WORDS = new Set(
  `ass asses arse arses bitch bitches bitchy bastard bastards cock cocks cocky dick dicks dildo dildos fag fags homo homos
  jap japs negro negroes nigra paki pakis piss pissed pisses pissing prick pricks pussy pussies slut sluts slutty
  tit tits titty titties turd turds wop wops dago dagos darkie darky gyp gyps gypped gypping gypsy honky honkies squaw squaws
  crap craps crappy bugger buggers buggery hooker hookers pimp pimps porn porno porns horny boob boobs booby boobies
  anus anal rectal penis penises vagina vaginas scrotum scrota semen sperm sperms orgasm orgasms sodomy sodomize sodomite
  rape raped rapes raping rapist rapists incest nazi nazis heil lynch lynched lynches lynching midget midgets
  crip crips cripple cripples crippled spaz spazz lesbo lesbos hebe hebes yid yids goy goyim kraut krauts
  mick micks polack polacks redskin redskins`.split(/\s+/),
);

// Fine words that happen to start with a blocked stem.
const ALLOW = new Set(['spice', 'spices', 'spiced', 'spicy', 'spicier', 'spiciest', 'spicery', 'spicule', 'spicules', 'chinked', 'chinking', 'chinkapin', 'cooncan', 'shittah', 'shittim', 'retardant', 'retardants', 'retardation']);

export function isBlocked(word) {
  const w = word.toLowerCase();
  if (WORDS.has(w)) return true;
  if (ALLOW.has(w)) return false;
  return STEMS.some((s) => w.startsWith(s));
}
