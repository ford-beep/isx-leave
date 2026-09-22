// Weekly rotation starts Monday, 21 Sep 2026.
// This first regular quote is intentionally fixed as the launch quote.
const ROTATION_START = "2026-09-21";

const regularQuotes = [
  // Launch week — keep this fixed for 21 Sep 2026.
  "Everyone can fly… after your leave gets approved ✈️",

  // Work / office / fun / Thai meme rotation
  "Coffee loaded. Brain loading… ☕🧠",
  "Another day, another tiny win. ✨",
  "ขอแก้อีกนิดเดียวครับ = เริ่มใหม่เกือบหมด 😂",
  "One task down. Only 47 tabs to go. 💻😂",
  "Small progress. Big main-character energy. ✨",
  "ประชุม 1 ชั่วโมง ได้งานกลับมา 7 อย่าง 🫠",
  "Ctrl + S. Trust nobody. 💾",
  "Work smart. Snack smarter. 🍪",
  "เดี๋ยวทำให้ครับ = เปิดแท็บไว้ก่อน 💻",
  "Plot twist: We actually finished early. 🎉",
  "Focus mode: activated. Notifications: disagreed. 🔔😂",
  "ส่งแล้วนะครับ 🙏 เหลือแค่ลุ้นว่าจะมีแก้ไหม",
  "Great ideas usually start with “Okay, hear me out…” 💡😂",
  "งานนี้ไม่ยากครับ แค่ยังไม่รู้ว่าทำยังไง 😂",
  "Teamwork makes the chaos look organized. 🤝😂",
  "Deadline approaching… walk normally. 😌",
  "ประชุมเสร็จแล้ว ทีนี้เริ่มทำงานจริงได้",
  "Make it work. Make it nice. Then pretend it was easy. 😎",
  "วันนี้ Productive มาก เปิดไฟล์ครบทุกงานแล้ว 😎",
  "You survived Monday. Achievement unlocked. 🏆",
  "ไฟล์สุดท้ายจริงๆ final_v8_REAL_FINAL.psd 😂",
  "Good ideas usually arrive 5 minutes before lunch. 🍜💡",
  "ยังไหวอยู่ครับ แต่กาแฟต้องมา ☕",
  "Done is better than stuck at 99%. ✅",
  "งานเสร็จแล้ว 99% อีก 1% คือแก้ไม่จบ 😂",
  "Inbox zero is a myth. We move on. 😂",
  "ขอเวลาคิดแป๊บ = ไปชงกาแฟ ☕",
  "Current status: doing my best and looking cute. ✨",
  "Another day, another “quick revision.” 😂",
  "ทำงานด้วยใจ แต่ Deadline ใช้กำลังบังคับ 😂",
  "Reminder: your laptop also deserves a lunch break. 💻🍱",
  "Rest is productive too. 🌿",
  "อันนี้แก้นิดเดียวจริงๆ ใช่ไหมครับ 👀",

  // Leave / travel — intentionally kept as a smaller part of the mix
  "Weekend wasn’t enough. 😭",
  "Work hard, travel harder. Just request leave first ✈️😎",
  "Current status: mentally on leave 🏝️",
  "Me: I’ll save my leave days. Also me: ✈️",

  // Finish the cycle bright
  "Good work takes time. Great work takes snacks. 🍪",
  "Friday is a state of mind. 😌",
];

const halloweenQuotes = [
  "ผีไม่น่ากลัวเท่า “ขอแก้อีกนิดนึง” 👻",
  "Ghosts aren’t real. Last-minute feedback is. 🎃",
  "คืนนี้มีผี พรุ่งนี้มีเดดไลน์ 💀",
  "No tricks, just approved leave 🎃✈️",
  "This task came back from the dead. 👻😂",
];

const loyKrathongQuotes = [
  "ลอยกระทงได้ แต่อย่าลอยงาน 😂🪷",
];

const christmasQuotes = [
  "All I want for Christmas is… ลูกค้าบอกผ่าน 🎄😂",
  "Work hard. Sleigh harder. 🛷✨",
  "The best Christmas gift? Approved leave 🎁✈️",
];

const newYearQuotes = [
  "ปีใหม่ งานใหม่ พลังใหม่… งานเก่ายังอยู่นะ 😂🎆",
  "New year, new ideas. Let’s make them happen. ✨🎆",
];

const songkranQuotes = [
  "เปียกได้ แต่อย่าให้ MacBook เปียก 💦💻",
  "สาดน้ำได้ แต่อย่าสาดงานด่วนมา 😂💦",
];

type Season =
  | "newYear"
  | "christmas"
  | "loyKrathong"
  | "halloween"
  | "songkran";

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

/**
 * Returns the seasonal theme for a Monday.
 *
 * Important:
 * The dashboard always decides the theme from the Monday
 * of the current week, so a theme never changes mid-week.
 */
function getSeason(date: Date): Season | null {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  // New Year takes priority over Christmas.
  if ((month === 12 && day >= 28) || (month === 1 && day <= 4)) {
    return "newYear";
  }

  // Christmas season
  if (month === 12 && day >= 7) {
    return "christmas";
  }

  // Loy Krathong week
  if (month === 11 && day >= 23 && day <= 29) {
    return "loyKrathong";
  }

  // Halloween edition — October
  if (month === 10) {
    return "halloween";
  }

  // Songkran edition
  if (month === 4 && day >= 6 && day <= 19) {
    return "songkran";
  }

  return null;
}

/**
 * Counts only regular Mondays since ROTATION_START.
 *
 * Seasonal weeks are skipped, which means they do NOT
 * consume a regular quote.
 *
 * Example:
 *
 * Sep 21 → Regular #1
 * Sep 28 → Regular #2
 *
 * October → Halloween
 *
 * Nov 02 → Regular #3
 */
function regularWeekIndex(date: string) {
  const targetMonday = mondayOf(date);
  const cursor = parseDate(ROTATION_START);

  let index = 0;

  while (cursor.getTime() < targetMonday.getTime()) {
    if (getSeason(cursor) === null) {
      index += 1;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return index;
}

/**
 * Counts which week of the current seasonal period we're in.
 *
 * Each seasonal collection starts from quote #1
 * when its season begins.
 *
 * Example:
 *
 * Oct 05 → Halloween #1
 * Oct 12 → Halloween #2
 * Oct 19 → Halloween #3
 * Oct 26 → Halloween #4
 */
function seasonalWeekIndex(monday: Date, season: Season) {
  const cursor = new Date(monday);
  let index = 0;

  while (true) {
    cursor.setUTCDate(cursor.getUTCDate() - 7);

    if (getSeason(cursor) !== season) {
      break;
    }

    index += 1;
  }

  return index;
}

function pickWeekly(quotes: string[], index: number) {
  const safeIndex =
    ((index % quotes.length) + quotes.length) % quotes.length;

  return quotes[safeIndex];
}

export function getDashboardQuote(companyDate: string) {
  const monday = mondayOf(companyDate);
  const season = getSeason(monday);

  if (season) {
    const seasonWeek = seasonalWeekIndex(monday, season);

    switch (season) {
      case "newYear":
        return pickWeekly(newYearQuotes, seasonWeek);

      case "christmas":
        return pickWeekly(christmasQuotes, seasonWeek);

      case "loyKrathong":
        return pickWeekly(loyKrathongQuotes, seasonWeek);

      case "halloween":
        return pickWeekly(halloweenQuotes, seasonWeek);

      case "songkran":
        return pickWeekly(songkranQuotes, seasonWeek);
    }
  }

  return pickWeekly(
    regularQuotes,
    regularWeekIndex(companyDate),
  );
}
