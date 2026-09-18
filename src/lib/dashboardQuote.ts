const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Weekly rotation starts Monday, 21 Sep 2026.
// This first quote is intentionally fixed as the launch quote.
const ROTATION_START = "2026-09-21";

const regularQuotes = [
  "Everyone can fly… after your leave gets approved ✈️",
  "Everyone can fly, if you buy a ticket and request leave ✈️",
  "Everyone can fly. Your leave balance decides how far 😂✈️",
  "Work hard, travel harder. Just request leave first ✈️😎",
  "I have a dream. It’s called annual leave. 🥹",
  "Me: I’ll save my leave days. Also me: ✈️",
  "POV: Your leave just got approved 😎✈️",
  "My leave balance: 1 day. My travel plans: Europe. ✈️💀",
  "Nobody: … Absolutely nobody: … Me: checking my leave balance 👀",
  "It’s giving… annual leave ✨",
  "Current status: mentally on leave 🏝️",
  "Plot twist: Your leave got approved. ✈️",
  "Weekend wasn’t enough. 😭",
  "404: Motivation not found. Try annual leave. 💻",
  "Trust the process. Request → Approve → ✈️",
  "Task failed successfully: Leave approved. ✅😂",
  "Achievement unlocked: Leave Approved 🏆✈️",
  "Loading motivation… 2% █░░░░░░░░░",
  "Not all heroes wear capes. Some approve leave. 🫡",
  "Keep calm and request leave. 😌",
  "May the leave balance be with you. ✨",
  "I came. I saw. I requested leave. 🫡",
];

const halloweenQuotes = [
  "Your leave balance is scary low 👻",
  "No tricks, just approved leave 🎃✈️",
  "Ghosted by work. Found on leave. 👻",
  "Spooky season. Even scarier: 0 leave days left. 💀🎃",
];

const loyKrathongQuotes = [
  "Float the krathong, not your leave request. 🪷👀",
  "Let your stress float away. Keep your leave balance. 🪷😂",
  "Full moon, good mood, approved leave. 🌕✨",
  "Tonight we float krathongs. Tomorrow we request leave. 🪷😂",
  "Let it go… except your remaining leave days. 🪷",
];

const christmasQuotes = [
  "All I want for Christmas is… approved leave 🎄✈️",
  "Dear Santa, I can explain my leave balance 🎅👀",
  "It’s beginning to look a lot like annual leave 🎄",
  "Santa checked the list. Your leave is still pending 🎅⏳",
  "Sleigh hard, leave harder 🛷😎",
  "Ho ho ho… out of office 🎅✈️",
  "Christmas magic is real. So is your leave balance ✨",
  "Dear Santa, please approve my leave 🎅🙏",
  "The best Christmas gift? Approved leave 🎁✈️",
];

const newYearQuotes = [
  "New year, same leave balance. 🎆😂",
  "New year loading… annual leave recommended 🎆✈️",
  "New year, new plans, same Request Leave button. 😎🎆",
];

const songkranQuotes = [
  "Out of office. Probably getting soaked. 💦",
  "Request leave before you splash away 💦😎",
  "Waterproof? Maybe. Work-proof? Annual leave. 😂💦",
  "Keep calm and splash on. Just request leave first. 💦",
];

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function mondayOf(date: string) {
  const current = parseDate(date);
  const day = current.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  current.setUTCDate(current.getUTCDate() - daysSinceMonday);
  return current;
}

function weeklyIndex(date: string) {
  const monday = mondayOf(date);
  const start = parseDate(ROTATION_START);

  return Math.floor((monday.getTime() - start.getTime()) / WEEK_MS);
}

function pickWeekly(quotes: string[], index: number) {
  const safeIndex = ((index % quotes.length) + quotes.length) % quotes.length;
  return quotes[safeIndex];
}

export function getDashboardQuote(companyDate: string) {
  const monday = mondayOf(companyDate);
  const month = monday.getUTCMonth() + 1;
  const day = monday.getUTCDate();
  const week = weeklyIndex(companyDate);

  // New Year week
  if ((month === 12 && day >= 28) || (month === 1 && day <= 4)) {
    return pickWeekly(newYearQuotes, week);
  }

  // Christmas season
  if (month === 12 && day >= 7) {
    return pickWeekly(christmasQuotes, week);
  }

  // Loy Krathong week.
  // 2026 Loy Krathong falls in late November, so keep the special
  // quote to that week instead of using it for the whole month.
  if (month === 11 && day >= 23 && day <= 29) {
    return pickWeekly(loyKrathongQuotes, week);
  }

  // Halloween edition — October
  if (month === 10) {
    return pickWeekly(halloweenQuotes, week);
  }

  // Songkran edition
  if (month === 4 && day >= 6 && day <= 19) {
    return pickWeekly(songkranQuotes, week);
  }

  return pickWeekly(regularQuotes, week);
}
