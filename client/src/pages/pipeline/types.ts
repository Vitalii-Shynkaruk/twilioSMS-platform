import { UniqueIdentifier } from '@dnd-kit/core';

export type ViewMode = 'board' | 'grid-2' | 'grid-3' | 'grid-4';

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  mappedStatus?: string | null;
  cards: PipelineCard[];
  _count?: { cards: number };
}

export interface PipelineCard {
  id: string;
  leadId: string;
  stageId: string;
  position: number;
  lead: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string;
    status: string;
    company?: string | null;
    assignedRepId?: string | null;
    notes?: string | null;
    tags: { tag: { id: string; name: string; color: string } }[];
  };
  notes?: string | null;
}

export interface ContextMenuState {
  x: number;
  y: number;
  type: 'card' | 'stage';
  card?: PipelineCard;
  stage?: PipelineStage;
}

export interface TagItem {
  id: string;
  name: string;
  color: string;
}

export interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
}
