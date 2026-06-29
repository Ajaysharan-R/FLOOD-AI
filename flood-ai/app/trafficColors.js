export function getTrafficColor(level) {
  if (level === "free") return "green";
  if (level === "moderate") return "orange";
  if (level === "heavy") return "red";
  return "blue";
}
