import type { ProjectedBlock, ProjectedTurn } from "@excelsior/core";

export class TurnStore {
  private turns: ProjectedTurn[] = [];
  private currentTurnId: string | null = null;

  reset(): void {
    this.turns = [];
    this.currentTurnId = null;
  }

  get currentId(): string | null {
    return this.currentTurnId;
  }

  set currentId(turnId: string | null) {
    this.currentTurnId = turnId;
  }

  list(): ProjectedTurn[] {
    return this.turns;
  }

  replaceAll(turns: ProjectedTurn[]): void {
    this.turns = turns;
  }

  ensure(turnId?: string, timestamp?: string): ProjectedTurn {
    const id = turnId || this.currentTurnId || `turn_${Date.now()}`;
    let turn = this.turns.find((candidate) => candidate.id === id);
    if (!turn) {
      turn = {
        id,
        status: "in-progress",
        blocks: [],
        startTime: timestamp || new Date().toISOString(),
      };
      this.turns.push(turn);
    }
    if (!this.currentTurnId) {
      this.currentTurnId = id;
    }
    return turn;
  }

  upsertBlock(turnId: string | undefined, block: ProjectedBlock): void {
    const turn = this.ensure(turnId, block.timestamp);
    const existingIndex = turn.blocks.findIndex((candidate) => candidate.id === block.id);
    if (existingIndex === -1) {
      turn.blocks.push(block);
    } else {
      turn.blocks[existingIndex] = block;
    }
  }

  updateBlock(blockId: string, update: (block: ProjectedBlock) => ProjectedBlock | null): boolean {
    for (const turn of this.turns) {
      const existingIndex = turn.blocks.findIndex((candidate) => candidate.id === blockId);
      if (existingIndex === -1) continue;
      const next = update(turn.blocks[existingIndex]!);
      if (next) turn.blocks[existingIndex] = next;
      return true;
    }
    return false;
  }

  snapshot(): ProjectedTurn[] {
    return this.turns.map((turn) => ({
      ...turn,
      blocks: [...turn.blocks],
    }));
  }
}
