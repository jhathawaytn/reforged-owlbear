import type { ReforgedCharacter } from "../types";

export default function savePlayerToFile(pc: ReforgedCharacter) {
  const file = new File(
    [JSON.stringify(pc, null, 2)],
    `${pc.name || "character"}.json`,
    { type: "application/json" },
  );
  const link = document.createElement("a");
  link.style.display = "none";
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    document.body.removeChild(link);
  }, 0);
}
