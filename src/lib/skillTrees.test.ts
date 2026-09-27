import { describe, it, expect } from "vitest";
import { nodePrerequisiteMet } from "./skillTrees";
import type { SkillNodeId } from "./skillTrees";

describe("Skill Tree Rank gate prerequisites (§7.7)", () => {
  it("R1 has no prerequisite", () => {
    expect(nodePrerequisiteMet([], "R1")).toBe(true);
  });

  it("a Branch requires only its own Rank gate", () => {
    expect(nodePrerequisiteMet(["R1"], "R1A")).toBe(true);
    expect(nodePrerequisiteMet([], "R1A")).toBe(false);
    expect(nodePrerequisiteMet(["R2"], "R1A")).toBe(false); // wrong Rank owned
  });

  it("a higher Rank gate needs the lower gate AND at least one Branch from it", () => {
    expect(nodePrerequisiteMet(["R1"], "R2")).toBe(false); // gate but no Branch
    expect(nodePrerequisiteMet(["R1", "R1A"], "R2")).toBe(true);
    expect(nodePrerequisiteMet(["R1", "R1B"], "R2")).toBe(true); // either Branch qualifies
  });

  it("R4 needs every preceding Rank gate plus a Branch from each", () => {
    const owned: SkillNodeId[] = ["R1", "R1A", "R2", "R2B", "R3"]; // R3 has no Branch yet
    expect(nodePrerequisiteMet(owned, "R4")).toBe(false);
    expect(nodePrerequisiteMet([...owned, "R3A"], "R4")).toBe(true);
  });

  it("a Mastery requires R4", () => {
    expect(nodePrerequisiteMet([], "R4A")).toBe(false);
    expect(nodePrerequisiteMet(["R1", "R1A", "R2", "R2A", "R3", "R3A", "R4"], "R4A")).toBe(true);
  });
});
