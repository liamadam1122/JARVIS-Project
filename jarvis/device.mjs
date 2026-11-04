// Apple silicon MacBook Air model identifiers have no fan.
const FANLESS_MAC_IDS = ["Mac14,2", "Mac14,15", "Mac15,12", "Mac15,13", "Mac16,12", "Mac16,13"];

export function macHasNoFan(modelText) {
  const text = String(modelText || "");
  if (/macbook air/i.test(text)) return true;
  return FANLESS_MAC_IDS.some(id => text.includes(id));
}
