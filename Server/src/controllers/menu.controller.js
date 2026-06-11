const ICEBREAKERS = [
  "What's a skill you'd love to learn this year?",
  "If you could live in any fictional world, which one?",
  "What's the best advice you've ever received?",
  "Describe your perfect lazy Sunday.",
  "What song has been stuck in your head lately?",
  "If you could have dinner with anyone, dead or alive, who?",
  "What's your most unpopular opinion?",
  "What's something you're irrationally afraid of?",
  "If you won the lottery tomorrow, what's the first thing you'd do?",
  "What's a movie you can watch over and over?",
  "What's the weirdest food combination you secretly love?",
  "If you could time travel, would you go to the past or the future?",
  "What's something on your bucket list?",
  "What's a hobby you picked up recently?",
  "If you could swap lives with someone for a day, who would it be?",
  "What's the last thing that made you laugh out loud?",
  "Coffee or tea — and how do you take it?",
  "What would your dream cafe look like?",
  "What's a book that changed your perspective?",
  "If you had to eat one cuisine for the rest of your life, which one?",
  "What's your go-to comfort food?",
  "What's the best trip you've ever taken?",
  "Early bird or night owl — and why?",
  "What's something people are always surprised to learn about you?",
  "If you could instantly master one instrument, which one?",
  "What's a small thing that makes your day better?",
  "What's the most spontaneous thing you've ever done?",
  "Describe your vibe in three words.",
  "What's a show you've been binge-watching?",
  "If your life had a theme song, what would it be?",
  "What's a tradition you'd love to start?",
  "What's your favorite way to unwind after a long day?",
  "If you could teleport anywhere right now, where would you go?",
  "What's the most interesting thing you learned this week?",
  "Pineapple on pizza — yes or no? Defend your answer.",
  "What's something you're proud of but rarely talk about?",
  "If you could add one room to your house, what would it be?",
  "What's a language you wish you spoke fluently?",
  "Morning routine or no routine at all?",
  "What's the best gift you've ever given or received?",
  "If you could relive one day from your past, which one?",
  "What's your favorite season and why?",
  "Cats or dogs — the eternal debate. Go.",
  "What's a conspiracy theory you find entertaining?",
  "If you started a band, what would you name it?",
  "What's a random act of kindness you'll never forget?",
  "What's the most useless talent you have?",
  "If you could only listen to one album forever, which one?",
  "What's something you believed as a kid that turned out to be wrong?",
  "Window seat or aisle seat?",
];

// Deterministic pick based on the date
function getTodaysIndex() {
  const now = new Date();
  const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  return daysSinceEpoch % ICEBREAKERS.length;
}

export async function getTodaysMenu(req, res) {
  const index = getTodaysIndex();
  res.json({
    prompt: ICEBREAKERS[index],
    date: new Date().toISOString().split('T')[0],
  });
}
