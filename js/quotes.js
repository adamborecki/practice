// Daily inspiration. Musician quotes get misattributed constantly, so this list sticks to
// well-documented lines and labels the shakier ones "attributed".
export const QUOTES = [
  { q: 'This will be our reply to violence: to make music more intensely, more beautifully, more devotedly than ever before.', a: 'Leonard Bernstein', src: 'speech, Nov. 1963' },
  { q: 'The more constraints one imposes, the more one frees one’s self of the chains that shackle the spirit.', a: 'Igor Stravinsky', src: 'Poetics of Music (1942)' },
  { q: 'If you don’t live it, it won’t come out of your horn.', a: 'Charlie Parker', src: 'Hear Me Talkin’ to Ya (1955)' },
  { q: 'An artist’s duty, as far as I’m concerned, is to reflect the times.', a: 'Nina Simone', src: 'interview' },
  { q: 'To achieve great things, two things are needed: a plan, and not quite enough time.', a: 'Leonard Bernstein', attributed: true },
  { q: 'Do not fear mistakes. There are none.', a: 'Miles Davis', attributed: true },
  { q: 'A problem is a chance for you to do your best.', a: 'Duke Ellington', attributed: true },
  { q: 'Just don’t give up trying to do what you really want to do. Where there is love and inspiration, I don’t think you can go wrong.', a: 'Ella Fitzgerald', attributed: true },
  { q: 'The piano ain’t got no wrong notes.', a: 'Thelonious Monk', attributed: true },
  { q: 'Musicians don’t retire; they stop when there’s no more music in them.', a: 'Louis Armstrong', attributed: true },
  { q: 'Asked why he still practiced in his nineties: “Because I think I’m making progress.”', a: 'Pablo Casals', attributed: true },
  { q: 'The humble improve.', a: 'Wynton Marsalis', attributed: true },
  { q: 'Passion is one great force that unleashes creativity, because if you’re passionate about something, then you’re more willing to take risks.', a: 'Yo-Yo Ma', attributed: true },
  { q: 'Overall, I think the main thing a musician would like to do is give a picture to the listener of the many wonderful things he knows of and senses in the universe.', a: 'John Coltrane', attributed: true },
  { q: 'Whenever one problem is mastered, leave it alone and proceed to the next. Practicing what no longer needs practice wastes time.', a: 'Ivan Galamian', src: 'Principles of Violin Playing & Teaching (paraphrased)' },
  { q: 'Regular, daily practice will put you much farther ahead than long, intense sessions spaced irregularly.', a: 'Ivan Galamian', src: 'Principles of Violin Playing & Teaching (paraphrased)' },
  { q: 'It’s not how much; it’s how.', a: 'Duke, Simmons & Cash', src: 'J. Research in Music Education (2009), title' },
  { q: 'Without music, life would be a mistake.', a: 'Friedrich Nietzsche', src: 'Twilight of the Idols (1889), trans.' },
  { q: 'Music expresses that which cannot be put into words and that which cannot remain silent.', a: 'Victor Hugo', src: 'William Shakespeare (1864)' },
  { q: 'I was obliged to be industrious. Whoever is equally industrious will succeed equally well.', a: 'J. S. Bach', src: 'reported by Forkel (1802)' },
  { q: 'Slow practice is the fast way.', a: 'Studio proverb', attributed: true },
  { q: 'Amateurs practice until they get it right; professionals practice until they can’t get it wrong.', a: 'Studio proverb', attributed: true },
  { q: 'The goal of practice isn’t to play it right once. It’s to make playing it right the easiest thing your hands know how to do.', a: 'Studio proverb', attributed: true },
  { q: 'If you hit a wrong note, it’s the next note that you play that determines if it’s good or bad.', a: 'Miles Davis', attributed: true },
  { q: 'I merely took the energy it takes to pout and wrote some blues.', a: 'Duke Ellington', attributed: true },
  { q: 'Where words fail, music speaks.', a: 'Hans Christian Andersen', attributed: true },
  { q: 'Take a break. Your brain keeps learning the passage while you rest — and while you sleep.', a: 'Practice science', src: 'see Health → Practice smarter' },
];

export function quoteForDate(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  const day = Math.floor((d - start) / 864e5);
  return QUOTES[(day * 7 + d.getFullYear()) % QUOTES.length];
}
